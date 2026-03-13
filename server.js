const express = require('express');
const session = require('express-session');
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({ secret: process.env.SESSION_SECRET || 'secret', resave: false, saveUninitialized: false }));

let mysqlPool, mongoDb, logsCol;

async function initDB() {
    try {
        const conn = await mysql.createConnection({ host: process.env.MYSQL_HOST, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE });
        await conn.query('CREATE DATABASE IF NOT EXISTS ' + process.env.MYSQL_DATABASE);
        await conn.end();
        mysqlPool = mysql.createPool({ host: process.env.MYSQL_HOST, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, connectionLimit: 5 });
        
        await mysqlPool.execute('CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), email VARCHAR(100) UNIQUE, phone VARCHAR(20), password VARCHAR(100), is_admin TINYINT DEFAULT 0)');
        await mysqlPool.execute('CREATE TABLE IF NOT EXISTS complaints (complaint_id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, title VARCHAR(200), category VARCHAR(50), priority VARCHAR(20), status VARCHAR(20) DEFAULT "Pending", created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id))');
        
        const [admins] = await mysqlPool.execute('SELECT * FROM users WHERE is_admin = 1');
        if (!admins.length) await mysqlPool.execute("INSERT INTO users (id, name, email, phone, password, is_admin) VALUES (1, 'Admin', 'admin@system.com', '1234567890', 'admin123', 1)");
        
        const mongoClient = new MongoClient(process.env.MONGO_URI);
        await mongoClient.connect();
        mongoDb = mongoClient.db(process.env.MONGO_DATABASE);
        logsCol = mongoDb.collection('complaint_logs');
        console.log('MySQL & MongoDB ready');
    } catch (e) { console.error('DB Error:', e.message); }
}

app.post('/api/register', async (req, res) => {
    if (!mysqlPool) return res.status(500).json({ success: false, message: 'DB not ready' });
    const { name, email, phone, password } = req.body;
    try {
        const [r] = await mysqlPool.execute('INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)', [name, email, phone, password]);
        res.json({ success: true, message: 'Registered', userId: r.insertId });
    } catch (e) { res.status(400).json({ success: false, message: 'Email exists' }); }
});

app.post('/api/login', async (req, res) => {
    if (!mysqlPool) return res.status(500).json({ success: false, message: 'DB not ready' });
    const { email, password } = req.body;
    const [users] = await mysqlPool.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (!users.length || users[0].password !== password) return res.status(401).json({ success: false, message: 'Invalid' });
    req.session.userId = users[0].id;
    req.session.isAdmin = users[0].is_admin;
    req.session.name = users[0].name;
    res.json({ success: true, user: { id: users[0].id, name: users[0].name, isAdmin: users[0].is_admin } });
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/user', (req, res) => req.session.userId ? res.json({ success: true, user: { id: req.session.userId, name: req.session.name, isAdmin: req.session.isAdmin } }) : res.status(401).json({ success: false }));

app.post('/api/complaint', async (req, res) => {
    if (!mysqlPool || !logsCol) return res.status(500).json({ success: false, message: 'DB not ready' });
    const { title, category, priority, description } = req.body;
    const [r] = await mysqlPool.execute('INSERT INTO complaints (user_id, title, category, priority, status) VALUES (?, ?, ?, ?, "Pending")', [req.session.userId, title, category, priority]);
    await logsCol.insertOne({ complaint_id: r.insertId, description, updates: [{ status: 'Pending', date: new Date().toISOString().split('T')[0] }] });
    res.json({ success: true, complaintId: r.insertId });
});

app.get('/api/complaints', async (req, res) => {
    if (!mysqlPool || !logsCol) return res.status(500).json({ success: false, message: 'DB not ready' });
    const sql = req.session.isAdmin ? 'SELECT c.*, u.name u_name, u.email u_email FROM complaints c JOIN users u ON c.user_id = u.id ORDER BY c.created_at DESC' : 'SELECT c.*, u.name u_name, u.email u_email FROM complaints c JOIN users u ON c.user_id = u.id WHERE c.user_id = ? ORDER BY c.created_at DESC';
    const [c] = req.session.isAdmin ? [await mysqlPool.execute(sql)] : [await mysqlPool.execute(sql, [req.session.userId])];
    for (let x of c[0]) { const l = await logsCol.findOne({ complaint_id: x.complaint_id }); if (l) { x.description = l.description; x.updates = l.updates; } }
    res.json({ success: true, complaints: c[0] });
});

app.put('/api/complaint/status', async (req, res) => {
    if (!mysqlPool || !logsCol) return res.status(500).json({ success: false, message: 'DB not ready' });
    const { complaintId, status } = req.body;
    await mysqlPool.execute('UPDATE complaints SET status = ? WHERE complaint_id = ?', [status, complaintId]);
    await logsCol.updateOne({ complaint_id: complaintId }, { $push: { updates: { status, date: new Date().toISOString().split('T')[0] } } });
    res.json({ success: true });
});

app.get('/api/complaint/:id', async (req, res) => {
    if (!mysqlPool || !logsCol) return res.status(500).json({ success: false, message: 'DB not ready' });
    const [[c]] = await mysqlPool.execute('SELECT c.*, u.name u_name, u.email u_email, u.phone u_phone FROM complaints c JOIN users u ON c.user_id = u.id WHERE c.complaint_id = ?', [req.params.id]);
    if (!c || (!req.session.isAdmin && c.user_id !== req.session.userId)) return res.status(403).json({ success: false });
    const l = await logsCol.findOne({ complaint_id: parseInt(req.params.id) });
    if (l) { c.description = l.description; c.updates = l.updates; }
    res.json({ success: true, complaint: c });
});

app.get('/', (r, res) => res.sendFile(__dirname + '/public/index.html'));
app.get('/login', (r, res) => res.sendFile(__dirname + '/public/login.html'));
app.get('/register', (r, res) => res.sendFile(__dirname + '/public/register.html'));
app.get('/dashboard', (r, res) => res.sendFile(__dirname + '/public/dashboard.html'));
app.get('/admin', (r, res) => res.sendFile(__dirname + '/public/admin.html'));

initDB().then(() => app.listen(PORT, () => console.log('Server: http://localhost:' + PORT + ' | Admin: admin@system.com / admin123')));

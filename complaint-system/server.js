const express = require('express');
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database connections
let mysqlConnection;
let mongoConnection;
let mongoDb;

// Initialize MySQL connection
async function initMySQL() {
    try {
        mysqlConnection = await mysql.createConnection({
            host: 'localhost:1521',
            user: 'SYSTEM',//here use your mysql username
            password: '8603',//here use your mysql password
            database: 'complaint_system'//here use your mysql database name, this is the default database name
            //this must be the same as the database name you created in mysql
            //if u havenot created a database, please create one first
            //steps are:
            //1. open mysql workbench
            //2. create a new database
            //3. use that database name here
            
        });
        console.log('MySQL connected');
        
        // Create tables if they don't exist
        await createTables();
    } catch (error) {
        console.error('MySQL connection error:', error);
    }
}

// Create MySQL tables
async function createTables() {
    const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            phone VARCHAR(20) NOT NULL,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    const createComplaintsTable = `
        CREATE TABLE IF NOT EXISTS complaints (
            complaint_id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            category VARCHAR(100) NOT NULL,
            priority ENUM('Low', 'Medium', 'High') NOT NULL,
            status ENUM('Pending', 'In Progress', 'Resolved') DEFAULT 'Pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `;
    
    await mysqlConnection.execute(createUsersTable);
    await mysqlConnection.execute(createComplaintsTable);
    console.log('MySQL tables created/verified');
}

// Initialize MongoDB connection
async function initMongoDB() {
    try {
        const client = new MongoClient('mongodb://localhost:27017');
        mongoConnection = await client.connect();
        mongoDb = mongoConnection.db('complaint_system');
        console.log('MongoDB connected');
    } catch (error) {
        console.error('MongoDB connection error:', error);
    }
}

// JWT secret
const JWT_SECRET = 'your-secret-key';

// Middleware to verify JWT token
function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// API Routes

// User Registration
app.post('/register', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        
        // Check if user already exists
        const [existingUser] = await mysqlConnection.execute(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );
        
        if (existingUser.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert user
        const [result] = await mysqlConnection.execute(
            'INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)',
            [name, email, phone, hashedPassword]
        );
        
        res.status(201).json({ message: 'User registered successfully', userId: result.insertId });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// User Login
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const [users] = await mysqlConnection.execute(
            'SELECT id, name, email, password FROM users WHERE email = ?',
            [email]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = users[0];
        
        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);
        
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email, name: user.name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Submit Complaint
app.post('/complaint', verifyToken, async (req, res) => {
    try {
        const { title, category, description, priority } = req.body;
        const userId = req.user.userId;
        
        // Insert complaint metadata into MySQL
        const [result] = await mysqlConnection.execute(
            'INSERT INTO complaints (user_id, title, category, priority) VALUES (?, ?, ?, ?)',
            [userId, title, category, priority]
        );
        
        const complaintId = result.insertId;
        
        // Insert complaint details into MongoDB
        const complaintLog = {
            complaint_id: complaintId,
            description: description,
            updates: [
                { status: 'Pending', date: new Date().toISOString().split('T')[0] }
            ]
        };
        
        await mongoDb.collection('complaint_logs').insertOne(complaintLog);
        
        res.status(201).json({ 
            message: 'Complaint submitted successfully', 
            complaintId 
        });
    } catch (error) {
        console.error('Complaint submission error:', error);
        res.status(500).json({ error: 'Complaint submission failed' });
    }
});

// View Complaints (Admin)
app.get('/complaints', verifyToken, async (req, res) => {
    try {
        // Get complaints from MySQL
        const [complaints] = await mysqlConnection.execute(`
            SELECT c.*, u.name as user_name, u.email as user_email 
            FROM complaints c 
            JOIN users u ON c.user_id = u.id 
            ORDER BY c.created_at DESC
        `);
        
        // Get complaint details from MongoDB
        const complaintIds = complaints.map(c => c.complaint_id);
        const mongoComplaints = await mongoDb.collection('complaint_logs')
            .find({ complaint_id: { $in: complaintIds } })
            .toArray();
        
        // Merge data
        const mergedComplaints = complaints.map(complaint => {
            const mongoData = mongoComplaints.find(m => m.complaint_id === complaint.complaint_id);
            return {
                ...complaint,
                description: mongoData?.description || '',
                updates: mongoData?.updates || []
            };
        });
        
        res.json(mergedComplaints);
    } catch (error) {
        console.error('View complaints error:', error);
        res.status(500).json({ error: 'Failed to fetch complaints' });
    }
});

// Update Complaint Status
app.put('/complaint/status', verifyToken, async (req, res) => {
    try {
        const { complaintId, status } = req.body;
        
        // Update status in MySQL
        await mysqlConnection.execute(
            'UPDATE complaints SET status = ? WHERE complaint_id = ?',
            [status, complaintId]
        );
        
        // Add status update to MongoDB
        await mongoDb.collection('complaint_logs').updateOne(
            { complaint_id: complaintId },
            { 
                $push: { 
                    updates: { 
                        status: status, 
                        date: new Date().toISOString().split('T')[0] 
                    } 
                } 
            }
        );
        
        res.json({ message: 'Complaint status updated successfully' });
    } catch (error) {
        console.error('Status update error:', error);
        res.status(500).json({ error: 'Status update failed' });
    }
});

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Initialize databases and start server
async function startServer() {
    await initMySQL();
    await initMongoDB();
    
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

startServer().catch(console.error);

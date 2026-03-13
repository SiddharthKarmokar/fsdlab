# Online Complaint/Issue Tracking System

A web application where users can submit complaints or issues and administrators can view, update, and resolve them. Uses MySQL for user information and complaint metadata, and MongoDB for complaint descriptions and status logs.

## Features

- User Registration and Login
- Complaint Submission
- Complaint Status Tracking (Admin Panel)
- MySQL for structured data (users, complaints)
- MongoDB for flexible data (descriptions, status logs)

## Database Setup

### MySQL
1. Create a database named `complaint_system`
2. The application will automatically create the required tables:
   - `users` (id, name, email, phone, password)
   - `complaints` (complaint_id, user_id, title, category, priority, status)

### MongoDB
1. Ensure MongoDB is running on localhost:27017
2. The application will use the `complaint_system` database
3. Collection `complaint_logs` will be created automatically

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

Or for development:
```bash
npm run dev
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

### User Flow:
1. Register a new account or login
2. Submit complaints with title, category, priority, and description
3. View submission confirmation

### Admin Flow:
1. Login with any user account
2. Navigate to Admin Panel
3. View all complaints
4. Update complaint status (Pending → In Progress → Resolved)

## API Endpoints

- `POST /register` - User registration
- `POST /login` - User login
- `POST /complaint` - Submit complaint (requires authentication)
- `GET /complaints` - View all complaints (requires authentication)
- `PUT /complaint/status` - Update complaint status (requires authentication)

## File Structure

```
complaint-system/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── public/                # Static files
│   ├── index.html         # Home page
│   ├── register.html      # User registration
│   ├── login.html         # User login
│   ├── dashboard.html     # User dashboard (complaint submission)
│   └── admin.html         # Admin panel
└── README.md              # This file
```

## Technologies Used

- **Backend**: Node.js, Express.js
- **Database**: MySQL, MongoDB
- **Authentication**: JWT (JSON Web Tokens)
- **Frontend**: HTML, CSS, JavaScript
- **Password Hashing**: bcryptjs

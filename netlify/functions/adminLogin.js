const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Simple hardcoded admin (for beta)
const ADMIN_CREDENTIALS = {
    username: 'adulibrary',
    password: 'password123'
};

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ message: 'Method not allowed' }),
        };
    }

    try {
        const { username, password } = JSON.parse(event.body);

        // Rate limiting check could be added here

        // Validate credentials
        if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
            // Generate JWT token
            const token = jwt.sign(
                { username, role: 'admin' },
                process.env.JWT_SECRET || 'default-secret-change-in-production',
                { expiresIn: '24h' }
            );

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    message: 'Login successful',
                    token,
                }),
            };
        } else {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({
                    message: 'Invalid credentials',
                }),
            };
        }
    } catch (error) {
        console.error('Error in adminLogin:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                message: 'Login failed',
                error: error.message,
            }),
        };
    }
};

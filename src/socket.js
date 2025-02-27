import React from "react";
import { io } from "socket.io-client";

// Choose the backend URL based on environment
const ENDPOINT = process.env.NODE_ENV === 'production'
  ? 'https://your-backend-url.onrender.com'  // Replace with your actual backend URL after deployment
  : 'http://localhost:4000';                 // Your local development server

// Create the socket connection
const socket = io(ENDPOINT, {
  transports: ['websocket'],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

// Log connection status
socket.on('connect', () => {
  console.log('Socket connected:', socket.id);
});

socket.on('disconnect', () => {
  console.log('Socket disconnected');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});

const SocketContext = React.createContext();

export { socket };
export default SocketContext;

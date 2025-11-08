import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();

// CORS setup - allow both local and production origins
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://shuklaarpit440:xwvcF71gxIKRzQJf@cluster0.tduy54y.mongodb.net/chatbot";
mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  contextData: { type: String, default: "" }, // User-specific context for chatbot
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return next(); // Continue without user if no token
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.userId).select("-password");
    next();
  } catch (err) {
    next(); // Continue without user if token invalid
  }
};

app.get("/", (req, res) => {
  res.send("Backend is running ✅");
});

// Register endpoint
app.post("/api/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword });
    await user.save();

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { email: user.email, id: user._id } });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Login endpoint
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { email: user.email, id: user._id } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update user context data
app.post("/api/user/context", authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { contextData } = req.body;
    req.user.contextData = contextData || "";
    await req.user.save();

    res.json({ message: "Context data updated successfully" });
  } catch (err) {
    console.error("Context update error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get user context data
app.get("/api/user/context", authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    res.json({ contextData: req.user.contextData || "" });
  } catch (err) {
    console.error("Get context error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Gemini setup
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) console.warn("⚠️ Missing GEMINI_API_KEY in .env");

const genAI = new GoogleGenerativeAI(apiKey);

// Load default KnectHotel domain data
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataFilePath = path.join(__dirname, "data", "knecthotel-data.txt");
let defaultDomainContext = "";

try {
  if (fs.existsSync(dataFilePath)) {
    defaultDomainContext = fs.readFileSync(dataFilePath, "utf-8");
  } else {
    console.warn(`⚠️ Domain data not found at ${dataFilePath}`);
  }
} catch (e) {
  console.warn("⚠️ Failed to load domain data:", e.message);
}

// Chat route with user context support
app.post("/api/chat", authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });
    if (!apiKey) return res.status(500).json({ error: "Server missing GEMINI_API_KEY" });

    // Use user context if logged in, otherwise use default
    let contextToUse = defaultDomainContext;
    if (req.user && req.user.contextData) {
      contextToUse = req.user.contextData;
    }

    const prompt = `You are QueryMate, a helpful assistant. Use ONLY the following context to answer. If the answer isn't in the context, say "I am here to discuss the information you've provided. Could you tell me more about what you're looking for?"\n\nContext:\n${contextToUse}\n\nUser question:\n${message}`;

    // Try models in order: gemini-2.0-flash-exp, gemini-1.5-flash, gemini-pro
    const modelsToTry = ["gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-pro"];
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        return res.json({ reply: text });
      } catch (err) {
        lastError = err;
        console.log(`Model ${modelName} failed, trying next...`);
        continue;
      }
    }

    // If all models failed, return error
    throw lastError || new Error("All models failed");
  } catch (err) {
    console.error("ERROR in /api/chat:", err);
    res.json({ reply: `Note: live AI unavailable. (Details: ${err.message})` });
  }
});

// Use PORT from environment (for Render.com) or default to 5000
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});

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

// CORS for regular endpoints
app.use((req, res, next) => {
  // Allow all origins for public chat endpoint (widget embedding)
  if (req.path === "/api/chat/public" || req.path === "/widget.js") {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
  } else {
    // Use standard CORS for other endpoints
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin) || !origin) {
      res.header("Access-Control-Allow-Origin", origin || "*");
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
  }
  next();
});

app.use(express.json());
app.use(express.static("public")); // Serve static files from public directory

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
  apiKey: { type: String, unique: true, sparse: true }, // API key for widget embedding
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

// ContextSession Schema
const contextSessionSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  collectedData: { type: Object, default: {} },
  stage: { type: String, enum: ["collecting", "complete"], default: "collecting" },
  lastUpdated: { type: Date, default: Date.now }
});

const ContextSession = mongoose.model("ContextSession", contextSessionSchema);

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

// Serve widget.js file
app.get("/widget.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const widgetPath = path.join(__dirname, "public", "widget.js");
  if (fs.existsSync(widgetPath)) {
    res.sendFile(widgetPath);
  } else {
    res.status(404).send("Widget file not found");
  }
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

    const user = await User.findById(req.user._id);
    const { contextData } = req.body;
    user.contextData = contextData || "";
    await user.save();

    res.json({ message: "Context data updated successfully" });
  } catch (err) {
    console.error("Context update error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Generate or regenerate API key
app.post("/api/user/api-key", authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await User.findById(req.user._id);
    // Generate a secure API key with email for uniqueness
    const crypto = await import("crypto");
    // Create a hash of email for uniqueness, then add random bytes
    const emailHash = crypto.createHash("md5").update(user.email).digest("hex").substring(0, 8);
    const randomBytes = crypto.randomBytes(24).toString("hex");
    const newApiKey = `qm_${emailHash}_${randomBytes}`;
    
    user.apiKey = newApiKey;
    await user.save();

    res.json({ apiKey: newApiKey, message: "API key generated successfully" });
  } catch (err) {
    console.error("API key generation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get API key (without regenerating)
app.get("/api/user/api-key", authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await User.findById(req.user._id).select("apiKey");
    res.json({ apiKey: user.apiKey || null });
  } catch (err) {
    console.error("Get API key error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get user context data
app.get("/api/user/context", authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Fetch fresh user data to get latest contextData and apiKey
    const user = await User.findById(req.user._id).select("-password");
    res.json({ 
      contextData: user.contextData || "",
      apiKey: user.apiKey || null
    });
  } catch (err) {
    console.error("Get context error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get or initialize context session
app.get("/api/context-session", authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    let session = await ContextSession.findOne({ email: req.user.email });
    const isNewSession = !session && !req.user.contextData;
    
    // If no session exists and user has no contextData, create new session
    if (isNewSession) {
      session = new ContextSession({
        email: req.user.email,
        collectedData: {},
        stage: "collecting"
      });
      await session.save();
      
      // Get initial greeting from Gemini
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (geminiApiKey) {
        try {
          const tempGenAI = new GoogleGenerativeAI(geminiApiKey);
          const prompt = `You are QueryMate, an intelligent assistant that gathers detailed context information about a business or service.

Your task is to ask smart, natural questions until you have enough information to generate a complete description.

Use what you already know to decide the next question — do not ask irrelevant or repetitive things.

Always collect details such as:
- What the business or service offers
- Target users or customers
- Core features or benefits
- Pricing or availability details
- Contact or support information
- Any additional unique qualities

Once you have enough context, mark the process as complete.

Respond in JSON format only:

{
  "reply": "<your next conversational question or confirmation>",
  "collectedData": {
    "business_name": "...",
    "description": "...",
    "target_audience": "...",
    "features": "...",
    "pricing": "...",
    "support": "...",
    "contact": "...",
    "...": "add dynamically as discovered"
  },
  "done": true or false
}

Current collected data:
{}

Latest user message:
"[Initial greeting - start the conversation]"`;

          const modelsToTry = ["gemini-1.5-pro", "gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-pro"];
          for (const modelName of modelsToTry) {
            try {
              const model = tempGenAI.getGenerativeModel({ model: modelName });
              const result = await model.generateContent(prompt);
              const response = await result.response;
              const text = response.text();
              
              let jsonText = text.trim();
              if (jsonText.startsWith("```")) {
                jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
              }
              
              const geminiResponse = JSON.parse(jsonText);
              if (geminiResponse.collectedData) {
                session.collectedData = { ...session.collectedData, ...geminiResponse.collectedData };
              }
              if (geminiResponse.done === true) {
                session.stage = "complete";
              }
              session.lastUpdated = new Date();
              await session.save();
              
              return res.json({
                session: {
                  collectedData: session.collectedData,
                  stage: session.stage,
                  lastUpdated: session.lastUpdated
                },
                initialMessage: geminiResponse.reply || "Hello! I'm QueryMate. Let's gather some information about your business or service. What does your business do?"
              });
            } catch (err) {
              continue;
            }
          }
        } catch (err) {
          console.error("Error getting initial greeting:", err);
        }
      }
      
      // Fallback if Gemini fails
      return res.json({
        session: {
          collectedData: session.collectedData,
          stage: session.stage,
          lastUpdated: session.lastUpdated
        },
        initialMessage: "Hello! I'm QueryMate. Let's gather some information about your business or service. What does your business do?"
      });
    }

    // If session exists but is complete, return it
    if (session) {
      return res.json({
        session: {
          collectedData: session.collectedData,
          stage: session.stage,
          lastUpdated: session.lastUpdated
        }
      });
    }

    // If user already has contextData, return that they're done
    res.json({
      session: {
        collectedData: {},
        stage: "complete",
        hasExistingContext: true
      }
    });
  } catch (err) {
    console.error("Get context session error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Send message to context collection conversation
app.post("/api/context-session/message", authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: "Server missing GEMINI_API_KEY" });
    }

    // Get or create session
    let session = await ContextSession.findOne({ email: req.user.email });
    if (!session) {
      session = new ContextSession({
        email: req.user.email,
        collectedData: {},
        stage: "collecting"
      });
    }

    if (session.stage === "complete") {
      return res.status(400).json({ error: "Context collection is already complete" });
    }

    // Build Gemini prompt
    const prompt = `You are QueryMate, an intelligent assistant that gathers detailed context information about a business or service.

Your task is to ask smart, natural questions until you have enough information to generate a complete description.

Use what you already know to decide the next question — do not ask irrelevant or repetitive things.

Always collect details such as:
- What the business or service offers
- Target users or customers
- Core features or benefits
- Pricing or availability details
- Contact or support information
- Any additional unique qualities

Once you have enough context, mark the process as complete.

Respond in JSON format only:

{
  "reply": "<your next conversational question or confirmation>",
  "collectedData": {
    "business_name": "...",
    "description": "...",
    "target_audience": "...",
    "features": "...",
    "pricing": "...",
    "support": "...",
    "contact": "...",
    "...": "add dynamically as discovered"
  },
  "done": true or false
}

Current collected data:
${JSON.stringify(session.collectedData, null, 2)}

Latest user message:
"${message}"`;

    // Call Gemini API
    const tempGenAI = new GoogleGenerativeAI(geminiApiKey);
    const modelsToTry = ["gemini-1.5-pro", "gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-pro"];
    let lastError = null;
    let geminiResponse = null;

    for (const modelName of modelsToTry) {
      try {
        const model = tempGenAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Try to parse JSON from response
        // Sometimes Gemini wraps JSON in markdown code blocks
        let jsonText = text.trim();
        if (jsonText.startsWith("```")) {
          jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        }
        
        geminiResponse = JSON.parse(jsonText);
        break;
      } catch (err) {
        lastError = err;
        console.log(`Model ${modelName} failed, trying next...`);
        continue;
      }
    }

    if (!geminiResponse) {
      throw lastError || new Error("All models failed");
    }

    // Merge collected data
    if (geminiResponse.collectedData) {
      session.collectedData = { ...session.collectedData, ...geminiResponse.collectedData };
    }

    // Update stage if done
    if (geminiResponse.done === true) {
      session.stage = "complete";
    }

    session.lastUpdated = new Date();
    await session.save();

    res.json({
      reply: geminiResponse.reply || "Thank you for the information!",
      collectedData: session.collectedData,
      done: geminiResponse.done || false
    });
  } catch (err) {
    console.error("Context session message error:", err);
    res.status(500).json({ error: err.message || "Failed to process message" });
  }
});

// Complete context session and save to User contextData
app.post("/api/context-session/complete", authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { finalContext } = req.body;
    
    // Get session
    const session = await ContextSession.findOne({ email: req.user.email });
    if (!session || session.stage !== "complete") {
      return res.status(400).json({ error: "Session not found or not complete" });
    }

    // Update user's contextData
    const user = await User.findById(req.user._id);
    // Use provided finalContext if available, otherwise format collectedData as readable text
    if (finalContext) {
      user.contextData = finalContext;
    } else {
      // Format collectedData into a readable context summary
      const data = session.collectedData;
      let formattedContext = "";
      
      if (data.business_name) {
        formattedContext += `Business Name: ${data.business_name}\n\n`;
      }
      if (data.description) {
        formattedContext += `Description:\n${data.description}\n\n`;
      }
      if (data.target_audience) {
        formattedContext += `Target Audience: ${data.target_audience}\n\n`;
      }
      if (data.features) {
        formattedContext += `Features:\n${data.features}\n\n`;
      }
      if (data.pricing) {
        formattedContext += `Pricing: ${data.pricing}\n\n`;
      }
      if (data.support) {
        formattedContext += `Support: ${data.support}\n\n`;
      }
      if (data.contact) {
        formattedContext += `Contact: ${data.contact}\n\n`;
      }
      
      // Add any additional fields
      Object.keys(data).forEach(key => {
        if (!["business_name", "description", "target_audience", "features", "pricing", "support", "contact"].includes(key)) {
          formattedContext += `${key}: ${data[key]}\n\n`;
        }
      });
      
      user.contextData = formattedContext.trim() || JSON.stringify(session.collectedData, null, 2);
    }
    
    await user.save();

    res.json({ 
      message: "Context data saved successfully!",
      contextData: user.contextData
    });
  } catch (err) {
    console.error("Complete context session error:", err);
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

// Middleware to authenticate by API key
const authenticateApiKey = async (req, res, next) => {
  const userApiKey = req.headers["x-api-key"] || req.body.apiKey;
  
  if (!userApiKey) {
    return next(); // Continue without user if no API key
  }

  try {
    const user = await User.findOne({ apiKey: userApiKey }).select("-password");
    if (user) {
      req.user = user;
    }
    next();
  } catch (err) {
    next(); // Continue without user if error
  }
};

// Public chat endpoint for widget (uses API key)
app.post("/api/chat/public", authenticateApiKey, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });
    if (!apiKey) return res.status(500).json({ error: "Server missing GEMINI_API_KEY" });

    // Use user context if API key is valid, otherwise use default
    let contextToUse = defaultDomainContext;
    if (req.user && req.user.contextData) {
      contextToUse = req.user.contextData;
    } else if (!req.user) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const prompt = `You are QueryMate, a helpful assistant. Use ONLY the following context to answer. If the answer isn't in the context, say "Hmm, that doesn’t seem related to what I can help with. Want to try a different question?"\n\nContext:\n${contextToUse}\n\nUser question:\n${message}`;

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
    console.error("ERROR in /api/chat/public:", err);
    res.status(500).json({ error: err.message || "Failed to process request" });
  }
});

// Chat route with user context support (for authenticated users)
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

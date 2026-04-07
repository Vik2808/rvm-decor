const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Parse incoming JSON request bodies
app.use(express.json());

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

// POST /submit — saves a form inquiry to MongoDB
app.post('/submit', async (req, res) => {
  const mongoUrl = process.env.MONGO_URL;

  if (!mongoUrl) {
    return res.status(500).json({
      error: 'MONGO_URL environment variable is not set.',
    });
  }

  const formData = req.body;
  if (!formData || typeof formData !== 'object') {
    return res.status(400).json({ error: 'Invalid or missing form data.' });
  }

  let client;
  try {
    client = new MongoClient(mongoUrl);
    await client.connect();

    const db = client.db();
    const collection = db.collection('inquiries');

    const doc = {
      ...formData,
      submittedAt: new Date(),
    };

    const result = await collection.insertOne(doc);

    res.json({
      success: true,
      bookingRef: result.insertedId.toString(),
    });
  } catch (err) {
    console.error('MongoDB error:', err);
    res.status(500).json({
      error: 'Failed to save inquiry to MongoDB.',
      details: err.message,
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

// GET /admin/data — lists all databases, collections, and sample documents
app.get('/admin/data', async (req, res) => {
  const mongoUrl = process.env.MONGO_URL;

  if (!mongoUrl) {
    return res.status(500).json({
      error: 'MONGO_URL environment variable is not set.',
    });
  }

  let client;
  try {
    client = new MongoClient(mongoUrl);
    await client.connect();

    const adminDb = client.db().admin();
    const { databases } = await adminDb.listDatabases();

    const result = {};

    for (const dbInfo of databases) {
      const dbName = dbInfo.name;
      // Skip internal MongoDB system databases
      if (['admin', 'local', 'config'].includes(dbName)) continue;

      const db = client.db(dbName);
      const collections = await db.listCollections().toArray();

      result[dbName] = {};

      for (const col of collections) {
        const colName = col.name;
        const docs = await db.collection(colName).find({}).limit(10).toArray();
        result[dbName][colName] = docs;
      }
    }

    res.json(result);
  } catch (err) {
    console.error('MongoDB error:', err);
    res.status(500).json({
      error: 'Failed to connect to MongoDB or retrieve data.',
      details: err.message,
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

app.listen(PORT, () => {
  console.log(`RVM Decor server running on port ${PORT}`);
  console.log(`Static site: http://localhost:${PORT}`);
  console.log(`Admin data:  http://localhost:${PORT}/admin/data`);
});

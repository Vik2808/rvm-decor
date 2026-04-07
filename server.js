const express = require('express');
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
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
    const bookingRef = result.insertedId.toString();

    // Send email notification — failures are non-fatal
    try {
      const emailUser = process.env.EMAIL_USER;
      const emailPassword = process.env.EMAIL_PASSWORD;

      if (emailUser && emailPassword) {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: emailUser,
            pass: emailPassword,
          },
        });

        const {
          name, phone, email, city, eventType, eventDate,
          eventTime, guests, package: pkg, color, addons, notes,
        } = formData;

        const adminUrl = process.env.RAILWAY_PUBLIC_DOMAIN
          ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/admin/data`
          : 'http://localhost:8080/admin/data';

        const mailOptions = {
          from: emailUser,
          to: 'vikramtest00@gmail.com',
          subject: `New Inquiry from ${name || 'Unknown'} — RVM Decor`,
          text: [
            'A new booking inquiry has been submitted via the RVM Decor website.',
            '',
            '─────────────────────────────',
            'INQUIRY DETAILS',
            '─────────────────────────────',
            `Name        : ${name || '—'}`,
            `Phone       : ${phone || '—'}`,
            `Email       : ${email || '—'}`,
            `City        : ${city || '—'}`,
            '',
            `Event Type  : ${eventType || '—'}`,
            `Event Date  : ${eventDate || '—'}`,
            `Event Time  : ${eventTime || '—'}`,
            `Guests      : ${guests || '—'}`,
            '',
            `Package     : ${pkg || '—'}`,
            `Colors      : ${color || '—'}`,
            `Add-ons     : ${addons || '—'}`,
            '',
            `Notes       : ${notes || '—'}`,
            '',
            '─────────────────────────────',
            `Booking Ref : ${bookingRef}`,
            `Submitted   : ${doc.submittedAt.toUTCString()}`,
            '',
            `View all inquiries in the admin panel:`,
            adminUrl,
          ].join('\n'),
        };

        await transporter.sendMail(mailOptions);
        console.log(`Inquiry notification sent to mayuri.asnani@gmail.com (ref: ${bookingRef})`);
      } else {
        console.warn('EMAIL_USER or EMAIL_PASSWORD not set — skipping notification email.');
      }
    } catch (emailErr) {
      console.error('Failed to send inquiry notification email:', emailErr.message);
    }

    res.json({
      success: true,
      bookingRef,
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

# Quick Start Guide

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Gemini API (Optional but Recommended)

Create a `.env` file in the project root:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```

Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

**Note:** The server works without Gemini but will use less accurate pattern matching. With Gemini, you get AI-powered extraction and insights.

### 3. Start the API Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

The server will start on `http://localhost:3000`

### 3. Open the Frontend

Open `spotsmart-complete.html` in your web browser, or serve it using a local web server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js http-server (install with: npm install -g http-server)
http-server -p 8000

# Using PHP
php -S localhost:8000
```

Then navigate to `http://localhost:8000/spotsmart-complete.html`

## Testing the APIs

### Test Parse Order Form API

```bash
curl -X POST http://localhost:3000/parse-order-form \
  -H "Content-Type: application/json" \
  -d '{
    "file": {
      "name": "test.pdf",
      "type": "application/pdf",
      "content": "base64-encoded-content-here"
    }
  }'
```

### Test Assess API

```bash
curl -X POST http://localhost:3000/assess \
  -H "Content-Type: application/json" \
  -d '{
    "intake_responses": {
      "section_1_account_stakeholder": {
        "organisation_name": "Test Company",
        "primary_poc": {
          "name": "John Doe",
          "role": "Manager",
          "email": "john@test.com",
          "timezone": "US"
        }
      }
    }
  }'
```

### Health Check

```bash
curl http://localhost:3000/health
```

## Troubleshooting

**CORS Issues:**
- The server includes CORS middleware, but if you encounter issues, ensure you're accessing the HTML file through a web server (not file://)

**Port Already in Use:**
- Change the port: `PORT=3001 npm start`
- Update the API URL in `spotsmart-complete.html` accordingly

**File Upload Errors:**
- Ensure files are valid PDF or DOCX format
- Check file size (max 10MB)
- Verify the file is not corrupted

## Next Steps

1. Customize the scoring algorithm in `server.js` based on your business requirements
2. Enhance the order form parser with more sophisticated extraction logic
3. Add authentication/authorization if needed
4. Deploy to a production environment


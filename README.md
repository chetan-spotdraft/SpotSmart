# SpotSmart API Server

Backend API server for the SpotSmart Implementation Readiness Assessment application.

## Features

- **Parse Order Form API**: Extracts data from uploaded PDF/DOCX order forms
- **Assess Readiness API**: Calculates readiness scores and generates implementation plans

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## Installation

1. Install dependencies:
```bash
npm install
```

## Running the Server

### Development Mode (with auto-reload):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

The server will start on port 3000 by default (or the port specified in the `PORT` environment variable).

## API Endpoints

### 1. Parse Order Form
**POST** `/parse-order-form`

Parses uploaded order form documents (PDF or DOCX) and extracts relevant information.

**Request Options:**

Option A - Direct file upload:
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

fetch('http://localhost:3000/parse-order-form', {
    method: 'POST',
    body: formData
});
```

Option B - Base64 encoded file:
```json
{
    "file": {
        "name": "order-form.pdf",
        "type": "application/pdf",
        "content": "base64-encoded-file-content"
    }
}
```

**Response:**
```json
{
    "success": true,
    "extracted_data": {
        "organisation_name": "Acme Corporation",
        "purchased_modules": ["Template Setup", "Migration"],
        "template_count": 5,
        "migration_contract_count": 2500,
        "integration_systems": ["Salesforce"]
    },
    "confidence": 0.85,
    "flags": [
        {
            "type": "warning",
            "message": "Template count not explicitly stated, estimated from context"
        }
    ]
}
```

### 2. Assess Readiness
**POST** `/assess`

Analyzes intake responses and generates readiness assessment.

**Request:**
```json
{
    "intake_responses": {
        "section_1_account_stakeholder": { ... },
        "section_2_order_form_scope": { ... },
        "section_3_template_readiness": { ... },
        "section_4_migration_readiness": { ... },
        "section_5_integration_readiness": { ... },
        "section_6_business_process": { ... },
        "section_7_security_compliance": { ... },
        "section_8_uploads": { ... }
    }
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "readiness_score": {
            "overall": 78,
            "breakdown": {
                "account_stakeholder": 90,
                "order_form_scope": 85,
                "template_readiness": 75,
                "migration_readiness": 70,
                "integration_readiness": 80,
                "business_process": 75,
                "security_compliance": 65
            }
        },
        "status_label": "Ready with Minor Blockers",
        "status_description": "Your organization is well-prepared for implementation. A few items need attention before go-live.",
        "red_flags": [ ... ],
        "action_items": {
            "customer": [ ... ],
            "spotdraft": [ ... ]
        },
        "implementation_plan": {
            "estimated_timeline": "12-16 weeks",
            "phases": [ ... ]
        }
    }
}
```

### 3. Health Check
**GET** `/health`

Returns server status.

## Configuration

Create a `.env` file to configure the server:

```
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
```

**Getting a Gemini API Key:**
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key and add it to your `.env` file

**Note:** If you don't provide a Gemini API key, the server will fall back to pattern matching for order form extraction (less accurate but still functional).

## Updating Frontend API URL

Update the `API_CONFIG.BASE_URL` in `spotsmart-complete.html`:

```javascript
const API_CONFIG = {
    BASE_URL: 'http://localhost:3000', // Update this to your server URL
    ENDPOINTS: {
        PARSE_ORDER_FORM: '/parse-order-form',
        ASSESS: '/assess'
    }
};
```

## Notes

- **AI-Powered Extraction**: With a Gemini API key, the order form parser uses Google Gemini AI for intelligent data extraction. Without a key, it falls back to pattern matching.
- **AI Insights**: The assessment API includes AI-generated insights (strengths, concerns, recommendations) when Gemini is configured.
- The readiness scoring algorithm can be customized based on your business requirements.
- File uploads are limited to 10MB by default.

## Troubleshooting

**Port already in use:**
- Change the PORT in `.env` or set it as an environment variable: `PORT=3001 npm start`

**File parsing errors:**
- Ensure uploaded files are valid PDF or DOCX format
- Check file size (max 10MB)
- Verify file is not corrupted

**CORS errors:**
- The server includes CORS middleware. If you encounter CORS issues, ensure the frontend URL is allowed in the CORS configuration.


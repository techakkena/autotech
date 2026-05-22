import fs from "fs";
import vision from "@google-cloud/vision";
import "dotenv/config";

const client = new vision.ImageAnnotatorClient({
  apiKey: process.env.GOOGLE_VISION_API_KEY,
});

async function testVision() {
  try {
    console.log("✅ API Key found");

    // Local image path
    const fileName = "./test-image.jpg";

    // Read local image
    const imageBuffer = fs.readFileSync(fileName);

    // Vision API request
    const [result] = await client.labelDetection({
      image: {
        content: imageBuffer.toString("base64"),
      },
    });

    console.log("\n🔍 Labels Detected:\n");

    result.labelAnnotations.forEach((label) => {
      console.log(`- ${label.description}`);
    });

  } catch (err) {
    console.error("❌ Vision API Error:", err.message);
  }
}

testVision();
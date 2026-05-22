import express from 'express';
import multer from 'multer';
import cloudinary from '../config/cloudinary.js';

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;

    const base64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

    const result = await cloudinary.uploader.upload(base64, {
      folder: 'autotech',
    });

    res.json({
      success: true,
      imageUrl: result.secure_url,
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;
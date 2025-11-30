
import imageCompression from 'browser-image-compression';

/**
 * Compresses an image file on the client side before upload.
 * Optimizes for Firebase Storage (Spark plan) by converting to WebP and reducing size.
 */
export const compressImage = async (file: File): Promise<File> => {
    // If it's not an image, return original
    if (!file.type.startsWith('image/')) {
        return file;
    }

    const options = {
        maxSizeMB: 0.5, // Max 500KB
        maxWidthOrHeight: 1920, // Full HD max
        useWebWorker: true,
        fileType: 'image/webp', // Modern format, smaller size
        initialQuality: 0.7
    };

    try {
        console.log(`Compressing ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)...`);
        const compressedFile = await imageCompression(file, options);
        console.log(`Compressed to ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);
        return compressedFile;
    } catch (error) {
        console.error("Image compression failed:", error);
        // Return original file as fallback if compression fails
        return file;
    }
};

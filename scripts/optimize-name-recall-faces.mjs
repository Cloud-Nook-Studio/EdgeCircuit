import sharp from "sharp";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(
  new URL(
    "../apps/web/public/assets/name-recall-faces.png",
    import.meta.url,
  ),
);
const destination = fileURLToPath(
  new URL(
    "../apps/web/public/assets/name-recall-faces.webp",
    import.meta.url,
  ),
);

await sharp(source)
  .resize(720, 720, {
    fit: "fill",
    kernel: sharp.kernel.lanczos3,
  })
  .webp({
    effort: 6,
    quality: 84,
    smartSubsample: true,
  })
  .toFile(destination);

console.log("Optimized the Name Recall face sprite for web delivery.");

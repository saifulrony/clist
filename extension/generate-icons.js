const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const sizes = [16, 48, 128];

sizes.forEach((size) => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#3b82f6");
  gradient.addColorStop(1, "#6366f1");

  // Rounded rectangle
  const radius = size * 0.2;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // House icon
  ctx.strokeStyle = "white";
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const s = size * 0.3;
  const cx = size / 2;
  const cy = size / 2;

  // Roof
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.8, cy + s * 0.1);
  ctx.lineTo(cx, cy - s * 0.7);
  ctx.lineTo(cx + s * 0.8, cy + s * 0.1);
  ctx.stroke();

  // Walls
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.55, cy + s * 0.05);
  ctx.lineTo(cx - s * 0.55, cy + s * 0.6);
  ctx.lineTo(cx + s * 0.55, cy + s * 0.6);
  ctx.lineTo(cx + s * 0.55, cy + s * 0.05);
  ctx.stroke();

  // Door
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.15, cy + s * 0.6);
  ctx.lineTo(cx - s * 0.15, cy + s * 0.3);
  ctx.lineTo(cx + s * 0.15, cy + s * 0.3);
  ctx.lineTo(cx + s * 0.15, cy + s * 0.6);
  ctx.stroke();

  // Save
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(path.join(__dirname, `icon${size}.png`), buffer);
  console.log(`Created icon${size}.png`);
});

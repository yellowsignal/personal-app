import assert from "node:assert/strict";
import { test } from "node:test";
import { selectImageFiles, saveBlobLocally } from "./photoUpload";

function file(name: string, type: string, size = 10): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

test("selectImageFiles keeps images, skips video, and caps at maxCount", () => {
  const picked = selectImageFiles(
    [
      file("a.jpg", "image/jpeg"),
      file("b.mp4", "video/mp4"),
      file("c.png", "image/png"),
      file("d.heic", "image/heic"),
      file("e.webp", "image/webp"),
    ],
    { maxCount: 3 },
  );
  assert.equal(picked.files.length, 3);
  assert.equal(picked.skippedNonImage, 1);
  assert.equal(picked.truncated, 1);
  assert.deepEqual(
    picked.files.map((f) => f.name),
    ["a.jpg", "c.png", "d.heic"],
  );
});

test("selectImageFiles skips oversized files and accepts heic by extension", () => {
  const picked = selectImageFiles(
    [file("big.jpg", "image/jpeg", 20), file("ok.heic", "", 4)],
    { maxBytes: 10 },
  );
  assert.equal(picked.skippedTooLarge, 1);
  assert.equal(picked.files.length, 1);
  assert.equal(picked.files[0].name, "ok.heic");
});

test("saveBlobLocally prefers share when available and falls back to download", async () => {
  const blob = new Blob([new Uint8Array(4)], { type: "image/jpeg" });
  const shared = await saveBlobLocally(blob, "a.jpg", {
    canShare: () => true,
    share: async () => undefined,
    clickDownload: () => {
      throw new Error("should not download");
    },
  });
  assert.equal(shared, "shared");

  const clicks: Array<{ href: string; filename: string }> = [];
  const downloaded = await saveBlobLocally(blob, "b.jpg", {
    canShare: () => false,
    clickDownload: (href, filename) => clicks.push({ href, filename }),
  });
  assert.equal(downloaded, "downloaded");
  assert.equal(clicks.length, 1);
  assert.equal(clicks[0].filename, "b.jpg");
});

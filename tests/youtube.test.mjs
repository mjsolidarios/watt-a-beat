import { test } from "node:test";
import assert from "node:assert/strict";
import { extractYoutubeId, youtubeErrorMessage } from "../src/youtube.mjs";

test("YouTube accepts video URL formats and rejects deceptive hosts and bare IDs", () => {
  for (const url of [
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30",
    "https://m.youtube.com/shorts/dQw4w9WgXcQ",
    "https://youtube.com/embed/dQw4w9WgXcQ",
    "https://youtube.com/live/dQw4w9WgXcQ",
  ])
    assert.equal(extractYoutubeId(url), "dQw4w9WgXcQ");
  for (const url of [
    "",
    "dQw4w9WgXcQ",
    "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=short",
    "javascript:youtube.com/watch?v=dQw4w9WgXcQ",
  ])
    assert.equal(extractYoutubeId(url), null);
});

test("YouTube errors explain actionable recovery", () => {
  assert.match(youtubeErrorMessage(100), /private/);
  assert.match(youtubeErrorMessage(150), /embedded/);
  assert.match(youtubeErrorMessage(153), /privacy/);
  assert.match(youtubeErrorMessage(5), /Retry/);
});

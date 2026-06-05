import assert from "node:assert/strict";
import test from "node:test";
import {
  hasSecretLikeText,
  redactSecretLikeText,
  redactedPreview,
  scanSecretLikeText,
  sha256Text
} from "../dist/redaction.js";

const SECRET_CASES = [
  {
    code: "private_key",
    value: [
      "-----BEGIN PRIVATE KEY-----",
      "abcdef0123456789",
      "-----END PRIVATE KEY-----"
    ].join("\n")
  },
  {
    code: "openai_key",
    value: ["sk-", "abcdefghijklmnopqrstuvwxyz", "123456"].join("")
  },
  {
    code: "github_token",
    value: ["ghp_", "abcdefghijklmnopqrstuvwxyz", "123456"].join("")
  },
  {
    code: "aws_access_key",
    value: ["AKIA", "1234567890", "ABCDEF"].join("")
  },
  {
    code: "google_api_key",
    value: ["AIza", "abcdefghijklmnopqrstuvwxyz", "123456789"].join("")
  },
  {
    code: "slack_token",
    value: ["xoxb", "-", "1234567890", "-", "abcdefghijklmnopqrstuvwxyz"].join("")
  },
  {
    code: "authorization_header",
    value: ["Authorization: Bearer ", "abcdefghijklmnopqrstuvwxyz", "123456"].join("")
  },
  {
    code: "keyed_secret",
    value: ["api_key=", "abcdefghijklmnopqrstuvwxyz", "123456"].join("")
  }
];

test("detects every supported secret family", () => {
  for (const secret of SECRET_CASES) {
    const findings = scanSecretLikeText([{
      field: "memory",
      text: `Remember ${secret.value}`
    }]);

    assert(
      findings.some((finding) => finding.code === secret.code),
      `expected ${secret.code} to be detected`
    );
  }
});

test("redacts every supported secret family", () => {
  for (const secret of SECRET_CASES) {
    const redacted = redactSecretLikeText(`Remember ${secret.value}`);

    assert.match(redacted, /\[MEMPR_REDACTED_SECRET\]/);
    assert.doesNotMatch(redacted, new RegExp(escapeRegExp(secret.value)));
  }
});

test("does not flag configured redaction markers when allowed", () => {
  assert.equal(
    hasSecretLikeText([{
      field: "memory",
      text: "api_key=[MEMPR_REDACTED_SECRET]"
    }], { allowRedactionMarkers: true }),
    false
  );
});

test("flags redaction-marker-shaped keyed secrets when markers are not allowed", () => {
  assert.equal(
    hasSecretLikeText([{
      field: "memory",
      text: "api_key=[MEMPR_REDACTED_SECRET]"
    }], { allowRedactionMarkers: false }),
    true
  );
});

test("redacted preview collapses whitespace and truncates safely", () => {
  const secret = ["sk-", "abcdefghijklmnopqrstuvwxyz", "123456"].join("");
  const preview = redactedPreview(`  first\n\tapi_key=${secret}   final words  `, 38);

  assert.equal(preview, "first api_key=[MEMPR_REDACTED_SECRE...");
  assert.doesNotMatch(preview, /\s{2,}|\n|\t/);
});

test("redacted preview never contains the original secret value", () => {
  const secret = ["sk-", "abcdefghijklmnopqrstuvwxyz", "123456"].join("");
  const preview = redactedPreview(`Use ${secret} for the demo.`);

  assert.doesNotMatch(preview, new RegExp(escapeRegExp(secret)));
  assert.match(preview, /\[MEMPR_REDACTED_SECRET\]/);
});

test("sha256Text is stable", () => {
  assert.equal(
    sha256Text("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function fakeOpenAiKey(label) {
  const suffix = String(label).replace(/[^A-Za-z0-9_-]/g, "");

  if (suffix.length < 20) {
    throw new Error("fake OpenAI key label must be at least 20 safe characters");
  }

  return ["sk", suffix].join("-");
}

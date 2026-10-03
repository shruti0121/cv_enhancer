// 👉 Replace with your API Gateway invoke URL + route,
// e.g. "https://abc123.execute-api.ca-central-1.amazonaws.com/enhance"
const API_URL = "https://YOUR-API-ID.execute-api.YOUR-REGION.amazonaws.com/enhance";

const jobInput = document.getElementById("jobDescription");
const bulletsInput = document.getElementById("bullets");
const enhanceBtn = document.getElementById("enhanceBtn");
const copyBtn = document.getElementById("copyBtn");
const errorBox = document.getElementById("error");
const emptyMsg = document.getElementById("empty");
const resultsList = document.getElementById("results");

let lastResults = [];

enhanceBtn.addEventListener("click", enhance);
copyBtn.addEventListener("click", copyResults);

async function enhance() {
  const jobDescription = jobInput.value.trim();
  const bullets = bulletsInput.value.trim();

  // Basic validation
  if (!jobDescription || !bullets) {
    showError("Add both a job description and at least one bullet.");
    return;
  }

  hideError();
  setLoading(true);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobDescription, bullets })
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    const data = await response.json();

    // Expected Lambda response: { "enhancedBullets": ["...", "..."] }
    // A single string with one bullet per line also works.
    let items = data.enhancedBullets;
    if (typeof items === "string") {
      items = items.split("\n").map(s => s.replace(/^[-•*\s]+/, "").trim()).filter(Boolean);
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("No bullets in response");
    }

    showResults(items);
  } catch (err) {
    console.error(err);
    showError("Couldn't enhance your bullets. Check your connection and try again.");
  } finally {
    setLoading(false);
  }
}

function showResults(items) {
  lastResults = items;
  resultsList.innerHTML = "";
  items.forEach(text => {
    const li = document.createElement("li");
    li.textContent = text; // textContent avoids injecting HTML
    resultsList.appendChild(li);
  });
  emptyMsg.hidden = true;
  copyBtn.hidden = false;
}

async function copyResults() {
  try {
    await navigator.clipboard.writeText(lastResults.map(b => "• " + b).join("\n"));
    copyBtn.textContent = "Copied";
    setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
  } catch {
    showError("Couldn't copy. Select the text and copy it manually.");
  }
}

function setLoading(isLoading) {
  enhanceBtn.disabled = isLoading;
  enhanceBtn.textContent = isLoading ? "Enhancing…" : "Enhance bullets";
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
}
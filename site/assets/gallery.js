const grid = document.querySelector("#tool-grid");
const count = document.querySelector("#tool-count");
const errorNotice = document.querySelector("#gallery-error");

function createCard(tool) {
  const card = document.createElement("article");
  card.className = "tool-card";

  const tag = document.createElement("p");
  tag.className = "tag";
  tag.textContent = tool.tag || "Tool";

  const title = document.createElement("h3");
  title.textContent = tool.name;

  const description = document.createElement("p");
  description.textContent = tool.description;

  const link = document.createElement("a");
  link.className = "open-link";
  link.href = tool.url;
  link.append("Open ");
  const arrow = document.createElement("span");
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↗";
  link.append(arrow);

  card.append(tag, title, description, link);
  return card;
}

try {
  const response = await fetch("./tools.json", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Gallery manifest returned ${response.status}`);
  const manifest = await response.json();
  if (!Array.isArray(manifest.tools)) throw new Error("Gallery manifest is missing tools");
  grid.replaceChildren(...manifest.tools.map(createCard));
  count.textContent = `${manifest.tools.length} tools`;
} catch (error) {
  console.error(error);
  count.textContent = "Tool list unavailable";
  errorNotice.hidden = false;
}


import path from "path";
import { promises as fs } from "fs";
import yaml from "js-yaml";
function expectString(value, field, required = true) {
    if (typeof value === "string" && value.trim())
        return value.trim();
    if (!required && (value === undefined || value === null || value === ""))
        return undefined;
    throw new Error(`Invalid config: "${field}" must be a non-empty string.`);
}
function expectStringArray(value, field) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
        throw new Error(`Invalid config: "${field}" must be an array of strings.`);
    }
    return value.map((item) => item.trim());
}
export function normalizeConfig(input) {
    if (!input || typeof input !== "object") {
        throw new Error("Invalid config: YAML root must be an object.");
    }
    const data = input;
    const type = expectString(data.type, "type")?.toLowerCase();
    if (type !== "chat" && type !== "task") {
        throw new Error('Invalid config: "type" must be either "chat" or "task".');
    }
    const knowledgeUrls = expectStringArray(data.knowledge?.urls, "knowledge.urls");
    const knowledgeFiles = expectStringArray(data.knowledge?.files, "knowledge.files");
    const actions = expectStringArray(data.actions, "actions");
    const whiteLabel = data.whiteLabel
        ? {
            primaryColor: expectString(data.whiteLabel.primaryColor, "whiteLabel.primaryColor"),
            logo: expectString(data.whiteLabel.logo, "whiteLabel.logo"),
        }
        : undefined;
    let embed;
    if (data.embed) {
        const embedType = expectString(data.embed.type, "embed.type");
        const position = expectString(data.embed.position, "embed.position");
        if (embedType !== "bubble" && embedType !== "iframe") {
            throw new Error('Invalid config: "embed.type" must be "bubble" or "iframe".');
        }
        if (position !== "bottom-right" && position !== "bottom-left") {
            throw new Error('Invalid config: "embed.position" must be "bottom-right" or "bottom-left".');
        }
        embed = {
            type: embedType,
            position: position,
        };
    }
    return {
        name: expectString(data.name, "name"),
        type,
        model: expectString(data.model, "model", false) || "claude-sonnet-4-6",
        systemPrompt: expectString(data.systemPrompt, "systemPrompt"),
        greeting: expectString(data.greeting, "greeting", false),
        knowledge: knowledgeUrls.length || knowledgeFiles.length
            ? { urls: knowledgeUrls, files: knowledgeFiles }
            : undefined,
        actions,
        whiteLabel,
        embed,
    };
}
export async function loadConfigFile(configPath) {
    const absolutePath = path.resolve(process.cwd(), configPath);
    const raw = await fs.readFile(absolutePath, "utf8");
    const parsed = yaml.load(raw);
    return {
        path: absolutePath,
        config: normalizeConfig(parsed),
    };
}

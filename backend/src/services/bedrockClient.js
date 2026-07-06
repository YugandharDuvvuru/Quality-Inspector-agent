import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { env } from "../config/env.js";

const client = new BedrockRuntimeClient({ region: env.AWS_REGION });

export async function invokeQualityInspectionModel({ prompt, image }) {
  // console.log(
  //   `[bedrock-client] region=${env.AWS_REGION} modelId=${env.BEDROCK_MODEL_ID} accessKey=${maskValue(process.env.AWS_ACCESS_KEY_ID)} secretPresent=${env.AWS_SECRET_ACCESS_KEY_PRESENT} sessionTokenPresent=${env.AWS_SESSION_TOKEN_PRESENT} sessionTokenLength=${process.env.AWS_SESSION_TOKEN?.length || 0}`
  // );
  // console.log(
  //   `[bedrock-client] imageAttached=${Boolean(image?.base64 && image?.mediaType)} imageMediaType=${image?.mediaType || "none"}`
  // );

  const content = [];

  if (image?.base64 && image?.mediaType) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType,
        data: image.base64,
      },
    });
  }

  content.push({ type: "text", text: prompt });

  const command = new InvokeModelCommand({
    modelId: env.BEDROCK_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 2400,
      temperature: 0.1,
      messages: [{ role: "user", content }],
    }),
  });

  const response = await client.send(command);
  const decoded = JSON.parse(Buffer.from(response.body).toString("utf-8"));
  return decoded.content?.map((item) => item.text).join("\n") || "";
}

export function extractJsonObject(text) {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Bedrock response did not contain a JSON object");
  }

  return JSON.parse(text.slice(firstBrace, lastBrace + 1));
}

function maskValue(value) {
  if (!value) {
    return "missing";
  }

  if (value.length <= 8) {
    return `${value[0]}***${value[value.length - 1]} (len=${value.length})`;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)} (len=${value.length})`;
}

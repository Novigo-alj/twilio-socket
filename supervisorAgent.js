async function fetchChatCompletionMessage(body) {
  console.log("Calling the mosaic AI end point");
  const response = await fetch("https://twilio-backend-578292646158.europe-west1.run.app", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: body.messages,
    }),
  });

  if (!response.ok) {
    console.warn("Server returned an error:", response);
    console.log("Error in end point: ", response);
    return { error: "Something went wrong." };
  }

  const completion = await response.json();
  const messages = completion.messages || [];

  const llmResponse = messages
    .filter(msg => msg.role === 'assistant')
    .map(msg => msg.content.trim())
    .join(' ');

  console.log("End point worked", llmResponse);
  return llmResponse;
}

function filterTranscriptLogs(transcriptLogs) {
  let breadcrumbCount = 0;
  const filtered = [];

  for (const item of transcriptLogs) {
    if (item.type === "BREADCRUMB" && breadcrumbCount < 2) {
      breadcrumbCount++;
      continue;
    }
    if (item.type === "MESSAGE") {
      const { guardrailResult, expanded, ...rest } = item;
      filtered.push(rest);
    } else {
      filtered.push(item);
    }
  }

  return filtered;
}

export async function getNextResponseFromSupervisor(
  { relevantContextFromLastUserMessage },
  transcriptLogs
) {
  const filteredLogs = filterTranscriptLogs(transcriptLogs);

  const body = {
    messages: [
      {
        role: "user",
        content: `==== Conversation History ====
${JSON.stringify(filteredLogs, null, 2)}

==== Relevant Context From Last User Message ===
${relevantContextFromLastUserMessage}`
      }
    ]
  };

  console.log('Sending to Databricks:', JSON.stringify(body, null, 2));

  const message = await fetchChatCompletionMessage(body);
  console.log("Message from supervisor agent:", message);

  if (typeof message === 'object' && message !== null && message.error) {
    return { error: "Something went wrong." };
  }

  return { nextResponse: message };
}
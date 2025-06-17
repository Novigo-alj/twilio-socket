import Fastify from 'fastify';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import { getNextResponseFromSupervisor } from "./supervisorAgent.js";

// Load environment variables from .env file
dotenv.config();

// Retrieve the OpenAI API key from environment variables.
const { OPENAI_API_KEY } = process.env;

if (!OPENAI_API_KEY) {
    console.error('Missing OpenAI API key. Please set it in the .env file.');
    process.exit(1);
}

// Initialize Fastify
const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// Constants
const SYSTEM_MESSAGE = `# Customer Service Junior Agent

You are a junior customer service representative for ALJ. Your primary role is to maintain a natural conversation flow while deferring most tasks to a senior Supervisor Agent through the \`getNextResponseFromSupervisor\` tool.

## Core Behavior
- **Default Action**: For any user request not explicitly listed in your allowed actions, call \`getNextResponseFromSupervisor\` with the full conversation history and the latest user message context.
- **Company Representation**: You work for ALJ.
- **Initial Greeting**: Respond to the first user message with exactly "Hi, you've reached ALJ, how can I help you today?" unless the conversation history indicates a prior greeting.
- **Conversation Principle**: Keep responses varied, natural, and concise. Never repeat the same phrasing twice for non-greeting responses.
- **Context Preservation**: Always check the conversation history before responding. If the user has already provided information (e.g., phone number, vehicle details), include it in the context sent to the supervisor agent and do not ask for it again unless explicitly instructed by the supervisor's response.
- **Phone Number Handling**: After the user's initial response, ask for their mobile number exactly once with: "May I have your mobile number to check your details?" 
    When user replies, call \'extractPhoneNumberFromTranscript\` with their speech transcript. Playback the number to user digit by digit.
    If the user denies the number to be correct, repeat the number capture and parsing step.
    If user confirms the number to be correct , call  \`getNextResponseFromSupervisor\` to verify if they are an existing customer. Do not ask for the phone number again if it already exists in the conversation history.
- **For new user**: always ask the user to spell their name and email address out letter by letter for the first time. This ensures the correct spelling is captured in the backend.
- **Do not repeat information (like name, email, phone, or vehicle details) unless absolutely necessary. Keep responses natural and efficient by avoiding unnecessary repetition of previously collected information.

## Expected Conversation Flow
1. Greet the user: "Hi, you've reached ALJ, how can I help you today?"
2. After the user responds, ask for their mobile number: "May I have your mobile number to check your details?"
3. Call \`getNextResponseFromSupervisor\` with the phone number to check if the user is an existing customer.
4. If existing, the supervisor will instruct to:
   - Add a new vehicle.
   - Book an appointment.
   - Check the status of a previous appointment.
5. If not existing, the supervisor will instruct to collect name and email to register the user, then proceed accordingly.

## Tone Guidelines
- Professional, helpful, and concise.
- Avoid overly enthusiastic or repetitive language.
- Balance efficiency with warmth to maintain a natural conversational flow.

## Your Allowed Actions (No Supervisor Required)
### 1. Basic Greetings & Pleasantries
- Respond to "hi", "hello", "good morning", etc., with "Hi, you've reached ALJ, how can I help you today?" if no prior greeting exists.
- Handle "how are you?", "thank you", "you're welcome" with simple responses like "I'm here to help, what's on your mind?" or "You're welcome!"
- Respond to requests for repetition (e.g., "can you please repeat that?") with a rephrased version of the last response.

### 2. Initial Phone Number Collection
- After the user's first substantive response (e.g., requesting a service), ask: "May I have your mobile number to check your details?"
- Do not ask for the phone number again if it is in the conversation history.

## Supervisor Agent Tools (Reference Only - DO NOT Call Directly)
- \`get_available_service\`: Lists all available services.
- \`get_available_slots\`: Shows appointment availability by location.
- \`get_booking_status_info\`: Checks booking status by vehicle.
- \`get_customer_details\`: Retrieves customer info by phone number.
- \`insert_customer_details\`: Creates new customer records.
- \`insert_vehicle_details\`: Adds new vehicle information.
- \`is_slot_updated\`: Checks if booking can be modified.
- \`process_booking_status\`: Manages booking operations.

## Using getNextResponseFromSupervisor
### When to Use
- After collecting the phone number to check customer status.
- Any service-related questions (e.g., booking, services, technical issues, complaints).
- Account-specific inquiries.
- Any request outside your allowed actions.
- Any situation where the next step is unclear based on the conversation history.

### Required Process
1. Use a brief filler phrase (e.g., "Let me check that for you.") before calling the tool.
2. Call \`getNextResponseFromSupervisor\` with:
   - The full conversation history, including all user and assistant messages.
   - The relevant context from the user's most recent message (translated to English if necessary).
3. Read the supervisor's response verbatim to the user.

### Filler Phrases (Use Before Every Tool Call)
- "Let me check that for you."
- "Hold on a sec, I’m pulling up the details."
- "Just a moment, I’m looking into that."
- "Alright, I’m getting that information."
- "One second, I’m checking the system."

### Tool Parameters
- \`relevantContextFromLastUserMessage\`: Include only key information from the user's most recent message (can be empty if no new information).

## Example Interaction
**User**: (Call starts)
**Assistant**: "Hi, you've reached ALJ, how can I help you today?"

**User**: "I want to book a service for my BMW X4."
**Assistant**: "May I have your mobile number to check your details?"
**User**: "It's 810-380-3991."
**Assistant**: "Let me check that for you."
*[Calls getNextResponseFromSupervisor with context: "Phone number: 810-380-3991" and full conversation history]*
**Supervisor Response**: "Customer not found. Ask for their full name and email to register."
**Assistant**: "I don’t see your number in our system. Could you please share your name and email to register?"

**User**: "Name: Kawan, Email: kawan@gmail.com"
**Assistant**: "Thanks, Kawan. Let me set that up."
*[Calls getNextResponseFromSupervisor with context: "Name: Kawan, Email: kawan@gmail.com" and full conversation history]*
**Supervisor Response**: "Customer registered. Confirm the service needed for their BMW X4."
**Assistant**: "You're all set, Kawan. You mentioned a service for your BMW X4. What type of service do you need?"

## Critical Reminders
- **Always** use the exact greeting: "Hi, you've reached ALJ, how can I help you today?" for the first message.
- **Never** ask for the phone number more than once unless explicitly instructed by the supervisor.
- **Always** include the full conversation history when calling getNextResponseFromSupervisor.
- **Never** answer service-specific questions yourself; always defer to the supervisor.
- **Always** use a filler phrase before calling getNextResponseFromSupervisor.
- **Maintain** natural conversation flow while staying within your role boundaries.
- **Do not** reference any example data as real information.

## Language Handling
- Detect the language of the user’s latest message.
- Respond in the same language the user used (e.g., Arabic if the user speaks Arabic).
- Send context to the supervisor agent in English.
- Maintain polite, clear, and natural phrasing in all languages.
`;
const VOICE = 'alloy';
const PORT = process.env.PORT || 5050;

// List of Event Types to log to the console.
const LOG_EVENT_TYPES = [
    'error',
    'response.content.done',
    'rate_limits.updated',
    'response.done',
    'input_audio_buffer.committed',
    'input_audio_buffer.speech_stopped',
    'input_audio_buffer.speech_started',
    'session.created',
    'conversation.item.created',
    'response.input_transcript'
];

// Show AI response elapsed timing calculations
const SHOW_TIMING_MATH = false;

// In-memory session history store
const sessionHistories = new Map();

// Root Route
fastify.get('/', async (request, reply) => {
    reply.send({ message: 'Twilio Media Stream Server is running!' });
});

// Route for Twilio to handle incoming calls
fastify.all('/incoming-call', async (request, reply) => {
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                          <Response>
                                <Say>Hi, you have reached ALJ. How can I assist you today? </Say>
                              <Pause length="1"/>
                              <Connect>
                                  <Stream url="wss://${request.headers.host}/media-stream" />
                              </Connect>
                          </Response>`;

    reply.type('text/xml').send(twimlResponse);
});

// WebSocket route for media-stream
fastify.register(async (fastify) => {
    fastify.get('/media-stream', { websocket: true }, async(connection, req) => {
        console.log('Client connected');

        // Connection-specific state
        let streamSid = null;
        let latestMediaTimestamp = 0;
        let lastAssistantItem = null;
        let markQueue = [];
        let responseStartTimestampTwilio = null;
        let conversationHistory = [];

        const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                "OpenAI-Beta": "realtime=v1"
            }
        });

        // Control initial session with OpenAI
        const initializeSession = () => {
            const sessionUpdate = {
                type: 'session.update',
                session: {
                    turn_detection: { type: 'server_vad' },
                    input_audio_format: 'g711_ulaw',
                    output_audio_format: 'g711_ulaw',
                    voice: VOICE,
                    instructions: SYSTEM_MESSAGE,
                    modalities: ["text", "audio"],
                    temperature: 0.8,
                    tools: [
                        {
                            type: 'function',
                            name: 'getNextResponseFromSupervisor',
                            description: 'Determines the next response whenever the agent faces a non-trivial decision, produced by a highly intelligent supervisor agent.',
                            parameters: {
                                type: 'object',
                                properties: {
                                    relevantContextFromLastUserMessage: {
                                        type: 'string',
                                        description: 'Key information from the user’s last message, translated to English if necessary.'
                                    }
                                },
                                additionalProperties: false
                            }
                        },
                        {
                        type: 'function',
                        name: 'extractPhoneNumberFromTranscript',
                        description: 'Parses spoken numbers (like "one three four five") into digit format (like "1345").',
                        parameters: {
                        type: 'object',
                        properties: {
                            spokenNumberText: {
                            type: 'string',
                            description: 'A string of individual digits as words, like nine five nine seven two. Avoid phrases like "double" or "triple".'
                            }
                        },
                        required: ['spokenNumberText'],
                        additionalProperties: false
                        }
                    }
                    ]
                }
            };

            openAiWs.send(JSON.stringify(sessionUpdate));
            sendInitialConversationItem();
        };

        // Send initial conversation item
        const sendInitialConversationItem = () => {
            const initialConversationItem = {
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'assistant',
                    content: [
                        {
                            type: 'text',
                            text: 'Hi, you\'ve reached ALJ, how can I help you today?'
                        }
                    ]
                }
            };

            if (SHOW_TIMING_MATH) console.log('Sending initial conversation item:', JSON.stringify(initialConversationItem));
            openAiWs.send(JSON.stringify(initialConversationItem));
            openAiWs.send(JSON.stringify({ type: 'response.create' }));
        };

        // function extractPhoneNumberFromTranscript(transcript) {
        //     const WORD_TO_DIGIT = {
        //         zero: '0', oh: '0',
        //         one: '1',
        //         two: '2', to: '2', too: '2',
        //         three: '3',
        //         four: '4', for: '4',
        //         five: '5',
        //         six: '6',
        //         seven: '7',
        //         eight: '8', ate: '8',
        //         nine: '9'
        //     };

        //     const words = transcript.toLowerCase().split(/\s+/);
        //     const digits = [];

        //     for (const word of words) {
        //         if (WORD_TO_DIGIT[word] !== undefined) {
        //         digits.push(WORD_TO_DIGIT[word]);
        //         }
        //     }

        //     return digits.length >= 4 ? digits.join('') : null;
        //     }

        function extractPhoneNumberFromTranscript(spoken) {
            if (!spoken) return null;

            // If it’s already digits, just validate and return
            const digitsOnly = spoken.replace(/\D/g, '');
            if (digitsOnly.length >= 10 && digitsOnly.length <= 12) {
                return digitsOnly;
            }

            // Otherwise, try to parse spoken words
            const WORD_TO_DIGIT = {
                'zero': '0', 'oh': '0',
                'one': '1',
                'two': '2', 'to': '2', 'too': '2',
                'three': '3',
                'four': '4', 'for': '4',
                'five': '5',
                'six': '6',
                'seven': '7',
                'eight': '8', 'ate': '8',
                'nine': '9'
            };

            const words = spoken.toLowerCase().split(/\s+/);
            const digits = [];

            for (const word of words) {
                const digit = WORD_TO_DIGIT[word];
                if (digit !== undefined) {
                    digits.push(digit);
                } else if (digits.length >= 3) {
                    break; // end of digit sequence
                } else {
                    digits.length = 0; // reset short burst
                }
            }

            return digits.length >= 4 ? digits.join('') : null;
        }




        // Handle interruption when the caller's speech starts
        const handleSpeechStartedEvent = () => {
            if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
                const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
                if (SHOW_TIMING_MATH) console.log(`Calculating elapsed time for truncation: ${latestMediaTimestamp} - ${responseStartTimestampTwilio} = ${elapsedTime}ms`);

                if (lastAssistantItem && elapsedTime > 0) {
                    const truncateEvent = {
                        type: 'conversation.item.truncate',
                        item_id: lastAssistantItem,
                        content_index: 0,
                        audio_end_ms: elapsedTime
                    };
                    if (SHOW_TIMING_MATH) console.log('Sending truncation event:', JSON.stringify(truncateEvent));
                    openAiWs.send(JSON.stringify(truncateEvent));
                }

                connection.send(JSON.stringify({
                    event: 'clear',
                    streamSid: streamSid
                }));

                markQueue = [];
                lastAssistantItem = null;
                responseStartTimestampTwilio = null;
            }
        };

        // Send mark messages to Media Streams
        const sendMark = (connection, streamSid) => {
            if (streamSid) {
                const markEvent = {
                    event: 'mark',
                    streamSid: streamSid,
                    mark: { name: 'responsePart' }
                };
                connection.send(JSON.stringify(markEvent));
                markQueue.push('responsePart');
            }
        };

        // Open event for OpenAI WebSocket
        openAiWs.on('open', () => {
            console.log('Connected to the OpenAI Realtime API');
            setTimeout(initializeSession, 100);
        });

        // Listen for messages from the OpenAI WebSocket
        openAiWs.on('message', async(data) => {
            try {
                const response = JSON.parse(data);

                if (LOG_EVENT_TYPES.includes(response.type)) {
                    // console.log(`Received event: ${response.type}`, response);
                }

                // Store user and assistant messages in conversation history
                if (response.type === 'conversation.item.created' && response.item.type === 'message') {
                    const content = response.item.content.find(c => c.type === 'input_text' || c.type === 'text');
                    if (content) {
                        conversationHistory.push({
                            type: 'MESSAGE',
                            role: response.item.role,
                            content: content.text
                        });
                        console.log('Updated conversationHistory (item.created):', JSON.stringify(conversationHistory, null, 2));
                    }
                }

                // Capture transcribed user input
                if (response.type === 'response.input_transcript' && response.transcript) {
                    conversationHistory.push({
                        type: 'MESSAGE',
                        role: 'user',
                        content: response.transcript
                    });
                    console.log('Updated conversationHistory (input_transcript):', JSON.stringify(conversationHistory, null, 2));
                }

                // Handle function call arguments
                if (response.type === 'response.function_call_arguments.done') {
                    console.log("Function called:", response);
                    const { arguments: args, name, call_id } = response;

                    try {
                        if (name === 'extractPhoneNumberFromTranscript') {
                        const parsedArgs = JSON.parse(args);
                        const transcript = parsedArgs.spokenNumberText || '';
                        console.log('Transcript received for parsing:', transcript);
                        console.log("Entered phone number parsing function");

                        const phoneNumber = extractPhoneNumberFromTranscript(transcript);

                        const functionOutput = {
                            phoneNumber: phoneNumber || 'No valid phone number found'
                        };

                        // Send function call output back to AI
                        const functionResponse = {
                            type: 'conversation.item.create',
                            item: {
                            type: 'function_call_output',
                            call_id,
                            output: JSON.stringify(functionOutput)
                            }
                        };
                        openAiWs.send(JSON.stringify(functionResponse));
                        openAiWs.send(JSON.stringify({ type: 'response.create' }));
                        // const spacedDigits = phoneNumber
                        // ? phoneNumber.split('').map(d => `${d}.`).join('    ')
                        // : '';

                        const spacedDigits = phoneNumber
                        .split('')
                        .map(d => `${d},`) // comma creates a clearer pause in TTS
                        .join(' ');         // single space to avoid over-slurring

                        // Push a message with digit-by-digit playback for user confirmation
                        conversationHistory.push({
                            type: 'MESSAGE',
                            role: 'assistant',
                            content: phoneNumber
                                ? `I heard your number as: ${spacedDigits}. Is that correct?`
                                : 'I could not understand the phone number. Please say it again.'
                            });

                        console.log('Updated conversationHistory (phone number parsing):', JSON.stringify(conversationHistory, null, 2));

                        } else if (name === 'getNextResponseFromSupervisor') {
                        const parsedArgs = JSON.parse(args);
                        const context = parsedArgs.relevantContextFromLastUserMessage || '';
                        const supervisorResponse = await getNextResponseFromSupervisor(
                            { relevantContextFromLastUserMessage: context },
                            conversationHistory
                        );

                        const functionResponse = {
                            type: 'conversation.item.create',
                            item: {
                            type: 'function_call_output',
                            call_id,
                            output: JSON.stringify(supervisorResponse)
                            }
                        };
                        openAiWs.send(JSON.stringify(functionResponse));
                        openAiWs.send(JSON.stringify({ type: 'response.create' }));

                        // Store supervisor response in history
                        conversationHistory.push({
                            type: 'MESSAGE',
                            role: 'assistant',
                            content: supervisorResponse.nextResponse || 'Error: No response from supervisor'
                        });

                        console.log('Updated conversationHistory (supervisor response):', JSON.stringify(conversationHistory, null, 2));
                        }
                    } catch (error) {
                        console.error(`Error calling function ${name}:`, error);
                        const errorResponse = {
                        type: 'conversation.item.create',
                        item: {
                            type: 'function_call_output',
                            call_id,
                            output: JSON.stringify({ error: `Failed to execute function ${name}` })
                        }
                        };
                        openAiWs.send(JSON.stringify(errorResponse));
                        openAiWs.send(JSON.stringify({ type: 'response.create' }));
                    }
                    }

                if (response.type === 'response.audio.delta' && response.delta) {
                    const audioDelta = {
                        event: 'media',
                        streamSid: streamSid,
                        media: { payload: response.delta }
                    };
                    connection.send(JSON.stringify(audioDelta));

                    if (!responseStartTimestampTwilio) {
                        responseStartTimestampTwilio = latestMediaTimestamp;
                        if (SHOW_TIMING_MATH) console.log(`Setting start timestamp for new response: ${responseStartTimestampTwilio}ms`);
                    }

                    if (response.item_id) {
                        lastAssistantItem = response.item_id;
                    }

                    sendMark(connection, streamSid);
                }

                if (response.type === 'input_audio_buffer.speech_started') {
                    handleSpeechStartedEvent();
                }
            } catch (error) {
                console.error('Error processing OpenAI message:', error, 'Raw message:', data);
            }
        });

        // Handle incoming messages from Twilio
        connection.on('message', (message) => {
            try {
                const data = JSON.parse(message);

                switch (data.event) {
                    case 'media':
                        latestMediaTimestamp = data.media.timestamp;
                        if (SHOW_TIMING_MATH) console.log(`Received media message with timestamp: ${latestMediaTimestamp}ms`);
                        if (openAiWs.readyState === WebSocket.OPEN) {
                            const audioAppend = {
                                type: 'input_audio_buffer.append',
                                audio: data.media.payload
                            };
                            openAiWs.send(JSON.stringify(audioAppend));
                        }
                        break;
                    case 'start':
                        streamSid = data.start.streamSid;
                        console.log('Incoming stream has started', streamSid);
                        conversationHistory = sessionHistories.get(streamSid) || [];
                        responseStartTimestampTwilio = null;
                        latestMediaTimestamp = 0;
                        break;
                    case 'mark':
                        if (markQueue.length > 0) {
                            markQueue.shift();
                        }
                        break;
                    default:
                        console.log('Received non-media event:', data.event);
                        break;
                }
            } catch (error) {
                console.error('Error parsing message:', error, 'Message:', message);
            }
        });

        // Handle connection close
        connection.on('close', () => {
            if (streamSid) {
                sessionHistories.set(streamSid, conversationHistory);
            }
            if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
            console.log('Client disconnected.');
        });

        // Handle WebSocket close and errors
        openAiWs.on('close', () => {
            console.log('Disconnected from the OpenAI Realtime API');
        });

        openAiWs.on('error', (error) => {
            console.error('Error in the OpenAI WebSocket:', error);
        });
    });
});

fastify.listen({ port: PORT }, (err) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server is listening on port ${PORT}`);
});
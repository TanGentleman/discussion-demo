// Sensitive API keys should be stored in the environment variables using `npx convex env`
const togetherSecretKey = process.env.OPENAI_API_KEY || "BAD API KEY"
// const openAISecretKey = process.env.OPENAI_API_KEY

const togetherBaseURL = "https://api.together.xyz/v1"
const togetherModelName = "meta-llama/Llama-3-70b-chat-hf"

const lmstudioBaseURL = "http://localhost:1234/v1"
const ollamaBaseURL = "http://localhost:11434/v1"

interface secretConfigSchema {
    baseURL?: string;
    modelName: string;
    apiKey: string;
}

const lmstudioConfig: secretConfigSchema = {
    baseURL: lmstudioBaseURL,
    modelName: "local-model",
    apiKey: "lm-studio"
};

const ollamaConfig: secretConfigSchema = {
    baseURL: ollamaBaseURL,
    modelName: "llama3",
    apiKey: "Ollama"
};

// const openAIConfig: secretConfigSchema = {
//     modelName: "gpt-3.5-turbo",
//     apiKey: openAISecretKey
// };

const togetherConfig: secretConfigSchema = {
    baseURL: togetherBaseURL,
    modelName: togetherModelName,
    apiKey: togetherSecretKey
};

export default togetherConfig;

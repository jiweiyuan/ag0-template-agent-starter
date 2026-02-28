import { createTool } from "@zypher/agent/tools";
import { z } from "zod";

const GetWeatherTool = createTool({
  name: "get_weather",
  description: "Get the current weather for a city",
  schema: z.object({
    city: z.string().describe("City name"),
  }),
  // Note: outputSchema is optional but highly RECOMMENDED for tools used with Programmable Tool Calls (PTC).
  // It documents the structure of result.structuredContent, which helps the agent to
  // generate correct code for accessing and manipulating tool results.
  outputSchema: z.object({
    city: z.string().describe("The city name"),
    temperature: z.number().describe("Temperature in Celsius"),
    condition: z.string().describe(
      "Weather condition (e.g., Sunny, Cloudy, Rainy)",
    ),
    unit: z.literal("celsius").describe("Temperature unit"),
  }),
  execute: ({ city }) => {
    // Mock weather data for European cities
    const MOCK_WEATHER: Record<string, { temp: number; condition: string }> = {
      paris: { temp: 8, condition: "Cloudy" },
      london: { temp: 6, condition: "Rainy" },
      berlin: { temp: 3, condition: "Snowy" },
      rome: { temp: 14, condition: "Sunny" },
      madrid: { temp: 12, condition: "Partly Cloudy" },
      amsterdam: { temp: 5, condition: "Windy" },
      vienna: { temp: 4, condition: "Foggy" },
      prague: { temp: 2, condition: "Cloudy" },
      barcelona: { temp: 16, condition: "Sunny" },
      lisbon: { temp: 18, condition: "Clear" },
    };
    const key = city.toLowerCase();
    const data = MOCK_WEATHER[key];
    if (!data) {
      // if there is no weather data for the city, throw an error
      // it is okay to throw an error directly as Zypher Agent will handle it gracefully
      // so no need to wrap extra try/catch around in your tool implementation
      throw new Error(`Weather data not available for ${city}`);
    }
    return Promise.resolve(
      {
        content: [{
          type: "text",
          text:
            `The weather in ${city} is ${data.condition} with a temperature of ${data.temp}°C`,
        }],
        structuredContent: {
          city,
          temperature: data.temp,
          condition: data.condition,
          unit: "celsius",
        },
      },
    );
  },
});

export { GetWeatherTool };

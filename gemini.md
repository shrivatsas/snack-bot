# Project Understanding: Snack Bot

This document outlines my understanding of the "Snack Bot" project based on the provided files.

## Project Overview

"Snack Bot" is a demonstration of a multi-agent system for automated procurement. It showcases an end-to-end workflow where an "office agent" interacts with "vendor agents" to order snacks for a team. The project is designed to be a realistic, minimal example of multi-agent collaboration, incorporating data retrieval, negotiation, and payment processing.

## Core Concepts & Protocols

The project is built around three key protocols:

*   **MCP (Multi-Capability Protocol):** Used by the office agent to read data from external sources, in this case, a Google Sheet containing team snack preferences and budget information.
*   **A2A (Agent-to-Agent) Protocol:** Enables communication and negotiation between the office agent and multiple vendor agents. This is used to query product catalogs, create quotes, negotiate terms, and lock a cart.
*   **AP2 (Agent Payment Protocol):** A protocol for handling payments. The Snack Bot uses AP2 to create and sign payment mandates, supporting features like split payments (e.g., an initial payment and a final payment upon delivery).

## Architecture

The project is structured as a monorepo with two main applications:

*   `apps/office-agent`: The primary agent that orchestrates the entire snack ordering process. It integrates with Google Sheets (MCP), vendor agents (A2A), and the payment system (AP2).
*   `apps/vendor-agent`: A simulated vendor that responds to requests from the office agent. The system can be configured to run multiple instances of the vendor agent to simulate a multi-vendor environment.

The entire environment is containerized using Docker, with a `docker-compose.yml` file in the `infra/` directory to manage the services.

## Key Technologies

*   **Backend:** Node.js with TypeScript
*   **Containerization:** Docker
*   **Build & Automation:** Makefiles are used to provide a simple interface for common tasks like installing dependencies, building the code, running tests, and starting the application.
*   **API Specification:** OpenAPI (formerly Swagger) is used to define the A2A and AP2 APIs, which can be found in the `openapi/` directory.
*   **Testing:** The project uses Jest for unit testing.

## How to Run

The project can be run in a few different ways:

1.  **Using Docker (Recommended):** The `Makefile` provides a `docker-up` command to start all the services (office agent, vendor agent(s), etc.) in a containerized environment.
2.  **Running Locally:** The agents can also be run directly on the host machine. The `README.md` provides instructions on how to do this.

A full end-to-end demo can be run using the `make demo` command, which simulates the entire process of ordering snacks, from reading preferences to making a payment.

## Summary

The "Snack Bot" project is a well-structured and comprehensive example of a multi-agent system. It demonstrates a practical use case for agent-to-agent communication and automated workflows. The use of clear protocols (MCP, A2A, AP2), containerization, and a well-defined project structure makes it a valuable reference for understanding and building similar systems.

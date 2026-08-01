#!/usr/bin/env node
import { main } from "../harness/agent.js";

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

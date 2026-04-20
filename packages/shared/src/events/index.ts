/**
 * @omni-view/shared — Events module
 *
 * Central export point for:
 * - Event name constants (`SIGNALING`, `AGENT_EVENTS`, `AGENT_MSG`, `SESSION_EVENTS`)
 * - Typed payload maps and discriminated-union message types
 * - Generic `TypedEventEmitter<EventMap>`
 */

export * from "./constants";
export { TypedEventEmitter } from "./typedEmitter";
export * from "./types";

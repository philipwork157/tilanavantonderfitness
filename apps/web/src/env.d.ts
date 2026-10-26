/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Whether this visitor sees the online checkout (set by src/middleware.ts). */
    checkout: boolean;
  }
}

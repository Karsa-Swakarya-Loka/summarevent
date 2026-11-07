/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as api_account from "../api/account.js";
import type * as api_admin from "../api/admin.js";
import type * as api_staff from "../api/staff.js";
import type * as api_visitor from "../api/visitor.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_core from "../lib/core.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_demo from "../lib/demo.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_links from "../lib/links.js";
import type * as lib_password from "../lib/password.js";
import type * as lib_tx from "../lib/tx.js";
import type * as mail from "../mail.js";
import type * as rpc from "../rpc.js";
import type * as shared_contract from "../shared/contract.js";
import type * as shared_db from "../shared/db.js";
import type * as shared_demoAccounts from "../shared/demoAccounts.js";
import type * as shared_dummyReceipt from "../shared/dummyReceipt.js";
import type * as shared_format from "../shared/format.js";
import type * as shared_labels from "../shared/labels.js";
import type * as shared_rules from "../shared/rules.js";
import type * as shared_seed from "../shared/seed.js";
import type * as shared_types from "../shared/types.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "api/account": typeof api_account;
  "api/admin": typeof api_admin;
  "api/staff": typeof api_staff;
  "api/visitor": typeof api_visitor;
  crons: typeof crons;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/core": typeof lib_core;
  "lib/crypto": typeof lib_crypto;
  "lib/demo": typeof lib_demo;
  "lib/errors": typeof lib_errors;
  "lib/links": typeof lib_links;
  "lib/password": typeof lib_password;
  "lib/tx": typeof lib_tx;
  mail: typeof mail;
  rpc: typeof rpc;
  "shared/contract": typeof shared_contract;
  "shared/db": typeof shared_db;
  "shared/demoAccounts": typeof shared_demoAccounts;
  "shared/dummyReceipt": typeof shared_dummyReceipt;
  "shared/format": typeof shared_format;
  "shared/labels": typeof shared_labels;
  "shared/rules": typeof shared_rules;
  "shared/seed": typeof shared_seed;
  "shared/types": typeof shared_types;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

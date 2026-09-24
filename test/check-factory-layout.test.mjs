import { test } from "node:test";
import { selfCheck } from "../scripts/check-factory-layout.mjs";

test("layout checker accepts generated shapes and rejects reserved-path mutations", selfCheck);

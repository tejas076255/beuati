import { describe, expect, it } from "vitest";
import { safeJsonLd } from "@/lib/json-ld";

describe("safeJsonLd", () => {
  it("cannot produce a literal </script> breakout from malicious content", () => {
    const malicious = "</script><script>alert(1)</script>";
    const serialized = safeJsonLd({ description: malicious });

    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<script>");
  });

  it("escapes angle brackets and ampersands used to break out of the script element", () => {
    const serialized = safeJsonLd({ value: "<b>bold</b> & more" });

    expect(serialized).not.toContain("<");
    expect(serialized).not.toContain(">");
    expect(serialized).not.toMatch(/[^\\]&/); // raw & never appears unescaped
    expect(serialized).toContain("\\u003c");
    expect(serialized).toContain("\\u003e");
    expect(serialized).toContain("\\u0026");
  });

  it("escapes JS line-terminator characters unsafe in <script> contexts", () => {
    const serialized = safeJsonLd({ value: `line1${String.fromCharCode(0x2028)}line2` });

    expect(serialized).toContain("\\u2028");
    expect(serialized).not.toContain(String.fromCharCode(0x2028));
  });

  it("preserves persisted JSON content through a parse round-trip", () => {
    const original = {
      name: "Dharti R Panchal",
      bio: "Bridal makeup artist </script> specialist & more <b>bold</b>",
      count: 42,
      nested: { tags: ["bridal", "hd makeup"] },
    };

    const serialized = safeJsonLd(original);
    // The script element's text content is the raw serialized string —
    // simulate parsing that same text back to JSON (no HTML entity decode
    // happens for JSON text; only the </>/& escapes decode).
    const roundTripped = JSON.parse(serialized);

    expect(roundTripped).toEqual(original);
  });

  it("produces syntactically valid JSON", () => {
    const serialized = safeJsonLd({ a: "</script><script>", b: "<>&", c: null, d: [1, 2, 3] });
    expect(() => JSON.parse(serialized)).not.toThrow();
  });
});

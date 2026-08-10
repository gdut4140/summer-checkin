import "dotenv/config";

async function main() {
  const KEY = process.env.EMBEDDING_API_KEY!;
  const MODEL = process.env.EMBEDDING_MODEL!;
  const BASE = process.env.EMBEDDING_BASE_URL!;
  const url = `${BASE}/v1/embeddings`;

  console.log("URL:", url);
  console.log("MODEL:", MODEL);
  console.log("KEY prefix:", KEY.slice(0, 25) + "...");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({ model: MODEL, input: ["hello world"] }),
  });

  const text = await res.text();
  console.log("STATUS:", res.status);
  console.log("BODY:", text.slice(0, 400));

  if (res.ok) {
    const data = JSON.parse(text);
    console.log("DIM:", data.data?.[0]?.embedding?.length);
    console.log("✅ API 正常！");
  } else {
    console.log("❌ 失败");
  }
}

main();

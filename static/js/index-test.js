async function fetchIAQ() {
  try {
    const res = await fetch("/calculate/iaq/avg", {
      method: "GET",
      credentials: "include"
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log("IAQ averages:", data);

  } catch (err) {
    console.error("Error fetching IAQ:", err);
  }
}

fetchIAQ();
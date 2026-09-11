import { randomUUID } from "node:crypto";
export const demoCurve = (offset = 0) =>
  Array.from({ length: 37 }, (_, i) => ({
    time: i * 15,
    temperature:
      Math.round(
        (25 + 205 * (1 - Math.exp(-i / 11)) + offset * Math.sin(i / 10)) * 10,
      ) / 10,
    fan: Math.round(15000 - i * 85),
  }));
export function seedDemo(s) {
  if (s.meta("demoSeeded")) return;
  const prefix = `demo-${randomUUID()}`;
  s.transaction(() => {
    const beans = [
      ["Gesha Village", "Ethiopia · Bench Maji", "Natural", "Gesha", 1800],
      ["Finca El Paraíso", "Colombia · Cauca", "Washed", "Castillo", 1400],
      [
        "Santa Inês",
        "Brazil · Mantiqueira",
        "Pulped natural",
        "Yellow Bourbon",
        2200,
      ],
    ];
    beans.forEach((b, i) =>
      s.put(
        "bean",
        {
          name: b[0],
          origin: b[1],
          process: b[2],
          variety: b[3],
          stock: b[4],
          notes: "Illustrative sample lot.",
          demo: true,
        },
        `${prefix}-bean-${i}`,
      ),
    );
    ["Gentle / filter", "Sweet / everyday", "Bright / washed"].forEach(
      (name, i) => {
        s.put(
          "profile",
          {
            name,
            description: [
              "A slower approach for delicate, expressive coffees.",
              "Building sweetness, one small adjustment at a time.",
              "A clean cup with a little more clarity.",
            ][i],
            demo: true,
          },
          `${prefix}-profile-${i}`,
        );
        s.put(
          "version",
          {
            profileId: `${prefix}-profile-${i}`,
            number: 1,
            name,
            description: "Illustrative curve — not validated for a roaster.",
            level: 2.1 + i * 0.3,
            points: demoCurve(i * 2),
            changeNote: "Initial exploration",
            demo: true,
          },
          `${prefix}-version-${i}`,
        );
      },
    );
    s.put(
      "experiment",
      {
        name: "Finding the sweet spot",
        hypothesis:
          "A little more development will bring out sweetness without losing the florals.",
        variable: "Roast level · 2.1 → 2.4",
        status: "active",
        conclusion: "",
        demo: true,
      },
      `${prefix}-experiment`,
    );
    for (let i = 0; i < 6; i++) {
      const date = new Date();
      date.setDate(date.getDate() - [2, 3, 5, 6, 8, 10][i]);
      const b = i % 3;
      s.put(
        "roast",
        {
          name: [
            "Gesha, a little sweeter",
            "A brighter Colombia",
            "Everyday espresso",
            "Gesha, first pass",
            "Clean & composed",
            "The chocolate baseline",
          ][i],
          beanId: `${prefix}-bean-${b}`,
          profileVersionId: `${prefix}-version-${b}`,
          experimentId: b === 0 ? `${prefix}-experiment` : null,
          roastedAt: date.toISOString(),
          greenWeight: 100,
          roastedWeight: 86.2 + i * 0.2,
          duration: 540,
          firstCrack: 438 + i * 3,
          level: 2.1 + b * 0.3,
          notes:
            "Sample roast for exploring Dialed. Replace with your own experiments.",
          points: demoCurve(i),
          fileId: null,
          demo: true,
        },
        `${prefix}-roast-${i}`,
      );
      if (i > 1)
        s.put("cupping", {
          roastId: `${prefix}-roast-${i}`,
          taster: "Dialed",
          tastedAt: new Date().toISOString(),
          score: [0, 0, 85.5, 87, 86.25, 84.5][i],
          aroma: 8,
          acidity: 8,
          sweetness: 8.5,
          body: 7.5,
          finish: 8,
          notes: [
            "",
            "",
            "Cacao, hazelnut, rounded finish.",
            "Jasmine, apricot, bergamot. A promising first pass.",
            "Citrus, honey, clean finish.",
            "Milk chocolate, almond, caramel.",
          ][i],
          demo: true,
        });
    }
    s.meta("demoSeeded", true);
  });
}

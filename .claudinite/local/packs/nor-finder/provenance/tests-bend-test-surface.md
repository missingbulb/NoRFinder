## 2026-11-03 · born · the page gained a no-sign-in exception so its tests could tag ground truth (#705)
- **Source:** the owner on #705: "the production code should be geared towards the live site. If you
  need something for tests - mess about the testing surface, not the prod surface."
- **Reason:** a branch in the page taken only where tests run changes what ships for their sake.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** prose in the repo's own pack; a check would have to recognise a test seam in
  arbitrary page code.
- **Retire when:** a check catches page code that branches on a test-only condition.
- **Landed:** #705

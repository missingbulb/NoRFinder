// An answer a stand-in holds until the test releases it, so "slower than the user" is an order the test sets rather
// than a time it guesses: asked resolves once the page asks, and the stand-in answers once release() is called.
export function held() {
  let wasAsked, released;
  const asked = new Promise((ok) => { wasAsked = ok; });
  const free = new Promise((ok) => { released = ok; });
  return {
    asked,
    // the stand-in's side: the page asked; resolves once the test lets the answer go
    hold() { wasAsked(); return free; },
    release() { released(); },
  };
}

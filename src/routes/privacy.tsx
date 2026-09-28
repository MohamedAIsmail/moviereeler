import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Reeler" },
      { name: "description", content: "How Reeler collects, uses and protects your viewing data." },
      { property: "og:title", content: "Privacy Policy — Reeler" },
      { property: "og:description", content: "How Reeler handles your viewing data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <LegalPage title="Privacy Policy">
      <p>Reeler helps you find movies and series based on what you’ve watched. This page explains what we store and why.</p>
      <h2>What we collect</h2>
      <p>Your email address and name (if you sign in with Google), the titles you add or import, your ratings and watch dates, the recommendations we make for you, and your feedback on them.</p>
      <h2>How we use it</h2>
      <p>Only to run Reeler: to show your library and create recommendations. Your list of titles and ratings is sent to an AI model to generate suggestions. We don’t sell your data or use it for advertising.</p>
      <h2>Try-without-account</h2>
      <p>If you use the demo, we store an anonymous, one-way scrambled version of your network address for 24 hours to prevent abuse, plus the demo results so repeated requests load instantly.</p>
      <h2>Where it’s stored</h2>
      <p>Data is stored with our hosting provider in secure, access-controlled databases. Only you can see your library.</p>
      <h2>Your rights</h2>
      <p>Under the GDPR you can access, correct, export or delete your data. You can delete your account and all your data at any time from the Account page in the app. For other requests, contact us.</p>
      <h2>Contact</h2>
      <p>Questions? Email privacy@reeler.app.</p>
    </LegalPage>
  ),
});

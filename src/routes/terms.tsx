import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Reeler" },
      { name: "description", content: "The terms for using Reeler." },
      { property: "og:title", content: "Terms of Service — Reeler" },
      { property: "og:description", content: "The terms for using Reeler." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <LegalPage title="Terms of Service">
      <p>By using Reeler you agree to these terms.</p>
      <h2>The service</h2>
      <p>Reeler suggests movies and series. Suggestions are generated automatically and may not always be accurate. Reeler is provided “as is”, without warranties.</p>
      <h2>Your account</h2>
      <p>Keep your login details safe. You’re responsible for what happens in your account. You can delete it at any time.</p>
      <h2>Fair use</h2>
      <p>Don’t misuse the service, try to break it, or access other people’s data. We limit how many recommendations can be generated per day to keep Reeler running for everyone.</p>
      <h2>Content</h2>
      <p>Titles, posters and summaries belong to their respective owners and are shown for information only.</p>
      <h2>Changes</h2>
      <p>We may update these terms. If we make big changes, we’ll let you know in the app.</p>
      <h2>Contact</h2>
      <p>Email hello@reeler.app.</p>
    </LegalPage>
  ),
});

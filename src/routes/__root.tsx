import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { Toaster } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";
import { WelcomeCarousel } from "@/components/onboarding/WelcomeCarousel";
import { SpotlightTour } from "@/components/onboarding/SpotlightTour";
import { OnboardingTaskBar } from "@/components/onboarding/OnboardingTaskBar";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "动能异兽" },
      { name: "description", content: "用动能喂养你的山海经异兽，争夺三大全服榜单。你每锻炼一次身体，你的异兽就更强" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "动能异兽" },
      { property: "og:description", content: "用动能喂养你的山海经异兽，争夺三大全服榜单。你每锻炼一次身体，你的异兽就更强" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "动能异兽" },
      { name: "twitter:description", content: "用动能喂养你的山海经异兽，争夺三大全服榜单。你每锻炼一次身体，你的异兽就更强" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/19caf978-6c1f-4d05-ad10-0ef5f0a7951a/id-preview-639b27c9--5f197987-8794-4523-bda5-c2a150ed067f.lovable.app-1778260735078.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/19caf978-6c1f-4d05-ad10-0ef5f0a7951a/id-preview-639b27c9--5f197987-8794-4523-bda5-c2a150ed067f.lovable.app-1778260735078.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <OnboardingProvider>
        <div className="min-h-screen flex flex-col">
          <SiteHeader />
          <OnboardingTaskBar />
          <main className="flex-1">
            <Outlet />
          </main>
          <footer className="text-center text-xs text-muted-foreground py-6 font-display tracking-widest">
            · 异兽录 · 以汗水化神兽 ·
          </footer>
        </div>
        <WelcomeCarousel />
        <SpotlightTour />
        <Toaster position="top-center" richColors />
      </OnboardingProvider>
    </QueryClientProvider>
  );
}

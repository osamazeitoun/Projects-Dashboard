import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { famTokens } from "@/lib/fam-tokens";
import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Milestones from "@/pages/milestones";
import Responses from "@/pages/responses";
import Landing from "@/pages/landing";
import Layout from "@/components/layout";
import PmLayout from "@/components/pm-layout";
import AdminLayout from "@/components/admin-layout";
import NoAccessGate from "@/components/no-access-notice";
import { useGetMe } from "@workspace/api-client-react";
import AdminProjects from "@/pages/admin/projects";
import AdminProjectDetail from "@/pages/admin/project-detail";
import AdminProcore from "@/pages/admin/procore";
import PmDashboard from "@/pages/pm/dashboard";
import PmSchedule from "@/pages/pm/schedule";
import PmMilestoneDetail from "@/pages/pm/milestone-detail";
import PmCompanies from "@/pages/pm/companies";
import PmChangeEvents from "@/pages/pm/change-events";
import PmChangeEventDetail from "@/pages/pm/change-event-detail";
import ClientLayout from "@/components/client-layout";
import ClientInbox from "@/pages/client/inbox";
import ClientPortfolio from "@/pages/client/portfolio";
import ClientProjectDetail from "@/pages/client/project-detail";
import ClientChangeEventDetail from "@/pages/client/change-event-detail";
import ClientBaselineReview from "@/pages/client/baseline-review";

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in environment");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: famTokens.ink,
    colorForeground: famTokens.ink,
    colorMutedForeground: famTokens.ink3,
    colorDanger: famTokens.danger,
    colorBackground: famTokens.bg,
    colorInput: famTokens.surface,
    colorInputForeground: famTokens.ink,
    colorNeutral: famTokens.ink,
    fontFamily: "Manrope, DM Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    borderRadius: "4px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-surface rounded-md w-[440px] max-w-full overflow-hidden border border-line",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-ink text-2xl font-serif font-normal tracking-tight",
    headerSubtitle: "text-ink-3",
    socialButtonsBlockButtonText: "text-ink font-medium",
    formFieldLabel: "text-ink-2 font-semibold text-xs",
    footerActionLink: "text-ink hover:text-ink-2 font-medium underline",
    footerActionText: "text-ink-3",
    dividerText: "text-ink-4",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function SmartHomeRedirect() {
  const { data: me, isLoading } = useGetMe();
  if (isLoading || !me) return null;
  if (me.isCompanyAdmin) return <Redirect to="/admin" />;
  if ((me.pmProjectIds?.length ?? 0) > 0) return <Redirect to="/pm" />;
  if ((me.contractorProjectIds?.length ?? 0) > 0)
    return <Redirect to="/dashboard" />;
  if ((me.clientProjectIds?.length ?? 0) > 0) return <Redirect to="/client/portfolio" />;
  return <NoAccessGate perspective="contractor"><div /></NoAccessGate>;
}

const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === "1";

function DevBanner() {
  if (!DEV_AUTH) return null;
  return (
    <div
      className="text-xs font-medium text-center py-1 px-3 text-ink"
      style={{ background: "color-mix(in oklab, var(--c-warn) 18%, var(--c-surface))" }}
    >
      Developer view: sign-in is bypassed. Turn off <code className="font-mono">VITE_DEV_AUTH</code> &amp; <code className="font-mono">DEV_AUTH_ENABLED</code> before publishing.
    </div>
  );
}

function HomeRedirect() {
  if (DEV_AUTH) return <SmartHomeRedirect />;
  return (
    <>
      <Show when="signed-in">
        <SmartHomeRedirect />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ProtectedContractorPage({ children }: { children: React.ReactNode }) {
  if (DEV_AUTH) {
    return (
      <NoAccessGate perspective="contractor">
        <Layout>{children}</Layout>
      </NoAccessGate>
    );
  }
  return (
    <>
      <Show when="signed-in">
        <NoAccessGate perspective="contractor">
          <Layout>{children}</Layout>
        </NoAccessGate>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ProtectedPmPage({ children }: { children: React.ReactNode }) {
  if (DEV_AUTH) {
    return (
      <NoAccessGate perspective="pm">
        <PmLayout>{children}</PmLayout>
      </NoAccessGate>
    );
  }
  return (
    <>
      <Show when="signed-in">
        <NoAccessGate perspective="pm">
          <PmLayout>{children}</PmLayout>
        </NoAccessGate>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ProtectedClientPage({ children }: { children: React.ReactNode }) {
  if (DEV_AUTH) {
    return (
      <NoAccessGate perspective="client">
        <ClientLayout>{children}</ClientLayout>
      </NoAccessGate>
    );
  }
  return (
    <>
      <Show when="signed-in">
        <NoAccessGate perspective="client">
          <ClientLayout>{children}</ClientLayout>
        </NoAccessGate>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading } = useGetMe();
  if (isLoading || !me) return null;
  if (!me.isCompanyAdmin) return <Redirect to="/" />;
  return <AdminLayout>{children}</AdminLayout>;
}

function ProtectedAdminPage({ children }: { children: React.ReactNode }) {
  if (DEV_AUTH) return <AdminGate>{children}</AdminGate>;
  return (
    <>
      <Show when="signed-in">
        <AdminGate>{children}</AdminGate>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function AppRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <DevBanner />
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/dashboard">
              <ProtectedContractorPage><Dashboard /></ProtectedContractorPage>
            </Route>
            <Route path="/milestones">
              <ProtectedContractorPage><Milestones /></ProtectedContractorPage>
            </Route>
            <Route path="/responses">
              <ProtectedContractorPage><Responses /></ProtectedContractorPage>
            </Route>
            <Route path="/pm">
              <ProtectedPmPage><PmDashboard /></ProtectedPmPage>
            </Route>
            <Route path="/pm/schedule">
              <ProtectedPmPage><PmSchedule /></ProtectedPmPage>
            </Route>
            <Route path="/pm/milestone/:id">
              <ProtectedPmPage><PmMilestoneDetail /></ProtectedPmPage>
            </Route>
            <Route path="/pm/companies">
              <ProtectedPmPage><PmCompanies /></ProtectedPmPage>
            </Route>
            <Route path="/pm/change-events">
              <ProtectedPmPage><PmChangeEvents /></ProtectedPmPage>
            </Route>
            <Route path="/pm/change-event/:id">
              <ProtectedPmPage><PmChangeEventDetail /></ProtectedPmPage>
            </Route>
            <Route path="/client">
              <ProtectedClientPage><ClientPortfolio /></ProtectedClientPage>
            </Route>
            <Route path="/client/portfolio">
              <ProtectedClientPage><ClientPortfolio /></ProtectedClientPage>
            </Route>
            <Route path="/client/portfolio/:id">
              <ProtectedClientPage><ClientProjectDetail /></ProtectedClientPage>
            </Route>
            <Route path="/client/inbox">
              <ProtectedClientPage><ClientInbox /></ProtectedClientPage>
            </Route>
            <Route path="/client/change-event/:id">
              <ProtectedClientPage><ClientChangeEventDetail /></ProtectedClientPage>
            </Route>
            <Route path="/client/baseline-review/:id">
              <ProtectedClientPage><ClientBaselineReview /></ProtectedClientPage>
            </Route>
            <Route path="/admin">
              <ProtectedAdminPage><AdminProjects /></ProtectedAdminPage>
            </Route>
            <Route path="/admin/projects/:id">
              <ProtectedAdminPage><AdminProjectDetail /></ProtectedAdminPage>
            </Route>
            <Route path="/admin/procore">
              <ProtectedAdminPage><AdminProcore /></ProtectedAdminPage>
            </Route>
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <AppRoutes />
    </WouterRouter>
  );
}

export default App;

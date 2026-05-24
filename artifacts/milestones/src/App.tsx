import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
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
import PmDashboard from "@/pages/pm/dashboard";
import PmSchedule from "@/pages/pm/schedule";
import PmMilestoneDetail from "@/pages/pm/milestone-detail";
import PmCompanies from "@/pages/pm/companies";
import PmChangeEvents from "@/pages/pm/change-events";
import PmChangeEventDetail from "@/pages/pm/change-event-detail";

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
    colorPrimary: "hsl(24 95% 53%)",
    colorForeground: "hsl(222 47% 11%)",
    colorMutedForeground: "hsl(215 16% 46%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(0 0% 100%)",
    colorInputForeground: "hsl(222 47% 11%)",
    colorNeutral: "hsl(215 28% 17%)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-card rounded-2xl w-[440px] max-w-full overflow-hidden border shadow-lg",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground text-2xl font-bold",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary hover:text-primary/80 font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
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
  return <NoAccessGate perspective="contractor"><div /></NoAccessGate>;
}

const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === "1";

function DevBanner() {
  if (!DEV_AUTH) return null;
  return (
    <div className="bg-amber-500 text-amber-950 text-xs font-medium text-center py-1 px-3">
      Developer view: sign-in is bypassed. Turn off <code>VITE_DEV_AUTH</code> &amp; <code>DEV_AUTH_ENABLED</code> before publishing.
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
            <Route path="/admin">
              <ProtectedAdminPage><AdminProjects /></ProtectedAdminPage>
            </Route>
            <Route path="/admin/projects/:id">
              <ProtectedAdminPage><AdminProjectDetail /></ProtectedAdminPage>
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

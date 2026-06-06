import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  schoolName?: string;
  portalUrl?: string;
  loginEmail?: string;
  password?: string;
  fullName?: string;
}

const SchoolAdminCredentialsEmail = ({
  schoolName = "your school",
  portalUrl = "https://example.smartdev.co.ke",
  loginEmail = "admin@example.com",
  password = "••••••••••",
  fullName,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Smartdev ERP admin account for {schoolName} is ready</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Welcome to Smartdev ERP</Heading>
        <Text style={text}>
          {fullName ? `Hi ${fullName},` : "Hi,"} your administrator account for{" "}
          <strong>{schoolName}</strong> has been created. You can sign in to your school's
          portal using the credentials below.
        </Text>

        <Section style={card}>
          <Text style={label}>Portal URL</Text>
          <Text style={value}>{portalUrl}</Text>
          <Hr style={hr} />
          <Text style={label}>Email</Text>
          <Text style={value}>{loginEmail}</Text>
          <Hr style={hr} />
          <Text style={label}>Temporary password</Text>
          <Text style={{ ...value, fontFamily: "monospace" }}>{password}</Text>
        </Section>

        <Section style={{ textAlign: "center", margin: "28px 0" }}>
          <Button href={portalUrl} style={button}>
            Open your portal
          </Button>
        </Section>

        <Text style={text}>
          For security, please sign in and change your password immediately. Treat this
          email as confidential — anyone with these details can access your school's
          system.
        </Text>

        <Hr style={hr} />
        <Text style={footer}>
          If you weren't expecting this email, please contact the Smartdev ERP team.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: SchoolAdminCredentialsEmail,
  subject: (data: Record<string, any>) =>
    `Your ${data?.schoolName ?? "school"} admin login — Smartdev ERP`,
  displayName: "School admin credentials",
  previewData: {
    schoolName: "Greenfield School",
    portalUrl: "https://greenfield.smartdev.co.ke",
    loginEmail: "principal@greenfield.ac.ke",
    password: "Temp1234!9",
    fullName: "Jane Mwangi",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, Helvetica, sans-serif" };
const container = { padding: "24px", maxWidth: "560px", margin: "0 auto" };
const h1 = { fontSize: "22px", fontWeight: "bold", color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.6", margin: "0 0 16px" };
const card = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "16px 0",
};
const label = { fontSize: "11px", textTransform: "uppercase" as const, color: "#64748b", margin: "0 0 4px", letterSpacing: "0.05em" };
const value = { fontSize: "14px", color: "#0f172a", margin: "0 0 12px", wordBreak: "break-all" as const };
const hr = { borderColor: "#e2e8f0", margin: "12px 0" };
const button = {
  backgroundColor: "#0ea5e9",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: "bold",
  display: "inline-block",
};
const footer = { fontSize: "12px", color: "#94a3b8", margin: "12px 0 0" };

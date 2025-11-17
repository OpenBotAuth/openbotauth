import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { NavLink } from "@/components/NavLink";
import { ArrowLeft, Save, HelpCircle } from "lucide-react";

const profileSchema = z.object({
  client_name: z.string().max(100).optional(),
  client_uri: z.string().url().max(255).optional().or(z.literal("")),
  logo_uri: z.string().url().max(255).optional().or(z.literal("")),
  contacts: z.string().optional(),
  expected_user_agent: z.string().max(255).optional(),
  rfc9309_product_token: z.string().max(100).optional(),
  rfc9309_compliance: z.string().optional(),
  trigger: z.string().max(50).optional(),
  purpose: z.string().max(50).optional(),
  targeted_content: z.string().max(255).optional(),
  rate_control: z.string().max(100).optional(),
  rate_expectation: z.string().max(100).optional(),
  known_urls: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const FieldTooltip = ({ content }: { content: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help inline ml-1" />
    </TooltipTrigger>
    <TooltipContent className="max-w-xs">
      <p>{content}</p>
    </TooltipContent>
  </Tooltip>
);

const EditProfile = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [previewData, setPreviewData] = useState<any>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      client_name: "",
      client_uri: "",
      logo_uri: "",
      contacts: "",
      expected_user_agent: "",
      rfc9309_product_token: "",
      rfc9309_compliance: "",
      trigger: "",
      purpose: "",
      targeted_content: "",
      rate_control: "",
      rate_expectation: "",
      known_urls: "",
    },
  });

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/login");
        return;
      }

      setUserId(session.user.id);

      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error) {
        toast.error("Failed to load profile");
        setLoading(false);
        return;
      }

      if (profileData) {
        setUsername(profileData.username);
        form.reset({
          client_name: profileData.client_name || "",
          client_uri: profileData.client_uri || "",
          logo_uri: profileData.logo_uri || "",
          contacts: profileData.contacts?.join(", ") || "",
          expected_user_agent: profileData.expected_user_agent || "",
          rfc9309_product_token: profileData.rfc9309_product_token || "",
          rfc9309_compliance: profileData.rfc9309_compliance?.join(", ") || "",
          trigger: profileData.trigger || "",
          purpose: profileData.purpose || "",
          targeted_content: profileData.targeted_content || "",
          rate_control: profileData.rate_control || "",
          rate_expectation: profileData.rate_expectation || "",
          known_urls: profileData.known_urls?.join(", ") || "",
        });
      }
      setLoading(false);
    };

    fetchProfile();
  }, [navigate, form]);

  // Watch form values and update preview
  const formValues = form.watch();
  
  useEffect(() => {
    const updatePreview = () => {
      const contactsArray = formValues.contacts
        ? formValues.contacts.split(",").map(c => c.trim()).filter(c => c)
        : [];
      
      const complianceArray = formValues.rfc9309_compliance
        ? formValues.rfc9309_compliance.split(",").map(c => c.trim()).filter(c => c)
        : [];
      
      const urlsArray = formValues.known_urls
        ? formValues.known_urls.split(",").map(u => u.trim()).filter(u => u)
        : [];

      const preview: any = {
        client_name: formValues.client_name || username,
        keys: [
          {
            kty: "OKP",
            crv: "Ed25519",
            kid: "example-key-id",
            x: "example-public-key",
            use: "sig",
            nbf: 1712793600,
            exp: 1715385600
          }
        ]
      };

      if (formValues.client_uri) preview.client_uri = formValues.client_uri;
      if (formValues.logo_uri) preview.logo_uri = formValues.logo_uri;
      if (contactsArray.length > 0) preview.contacts = contactsArray;
      if (formValues.expected_user_agent) preview["expected-user-agent"] = formValues.expected_user_agent;
      if (formValues.rfc9309_product_token) preview["rfc9309-product-token"] = formValues.rfc9309_product_token;
      if (complianceArray.length > 0) preview["rfc9309-compliance"] = complianceArray;
      if (formValues.trigger) preview.trigger = formValues.trigger;
      if (formValues.purpose) preview.purpose = formValues.purpose;
      if (formValues.targeted_content) preview["targeted-content"] = formValues.targeted_content;
      if (formValues.rate_control) preview["rate-control"] = formValues.rate_control;
      if (formValues.rate_expectation) preview["rate-expectation"] = formValues.rate_expectation;
      if (urlsArray.length > 0) preview["known-urls"] = urlsArray;
      
      preview.Verified = false;

      setPreviewData(preview);
    };

    updatePreview();
  }, [formValues, username]);

  const onSubmit = async (values: ProfileFormValues) => {
    try {
      const contactsArray = values.contacts
        ? values.contacts.split(",").map(c => c.trim()).filter(c => c)
        : null;
      
      const complianceArray = values.rfc9309_compliance
        ? values.rfc9309_compliance.split(",").map(c => c.trim()).filter(c => c)
        : null;
      
      const urlsArray = values.known_urls
        ? values.known_urls.split(",").map(u => u.trim()).filter(u => u)
        : null;

      const { error } = await supabase
        .from('profiles')
        .update({
          client_name: values.client_name || null,
          client_uri: values.client_uri || null,
          logo_uri: values.logo_uri || null,
          contacts: contactsArray,
          expected_user_agent: values.expected_user_agent || null,
          rfc9309_product_token: values.rfc9309_product_token || null,
          rfc9309_compliance: complianceArray,
          trigger: values.trigger || null,
          purpose: values.purpose || null,
          targeted_content: values.targeted_content || null,
          rate_control: values.rate_control || null,
          rate_expectation: values.rate_expectation || null,
          known_urls: urlsArray,
        })
        .eq('id', userId);

      if (error) throw error;

      toast.success("Profile updated successfully!");
      navigate(`/${username}`);
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">OpenBotRegistry</h1>
          <div className="flex items-center gap-4">
            <NavLink to={`/${username}`} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4 inline mr-1" />
              Back to Profile
            </NavLink>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Edit Bot Metadata</CardTitle>
              <CardDescription>
                Configure your bot's metadata for the JWKS endpoint
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TooltipProvider>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="client_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Bot Name
                            <FieldTooltip content="The display name for your bot in the JWKS response" />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="Example Bot" {...field} />
                          </FormControl>
                          <FormDescription>Defaults to username if not provided</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="client_uri"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Bot Website URL
                            <FieldTooltip content="URL to your bot's information page" />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="https://example.com/bot/about.html" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="logo_uri"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Logo URL
                            <FieldTooltip content="URL to your bot's logo image" />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="https://example.com/logo.png" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="contacts"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Contact Emails
                            <FieldTooltip content='Comma-separated emails with "mailto:" prefix' />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="mailto:bot-support@example.com, mailto:admin@example.com" {...field} />
                          </FormControl>
                          <FormDescription>Separate with commas</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="expected_user_agent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Expected User Agent
                            <FieldTooltip content="The user agent string your bot uses" />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="Mozilla/5.0 ExampleBot" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="rfc9309_product_token"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            RFC 9309 Product Token
                            <FieldTooltip content="RFC 9309 compliant product identifier" />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="ExampleBot" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="rfc9309_compliance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            RFC 9309 Compliance
                            <FieldTooltip content='Features your bot complies with: User-Agent, Allow, Disallow, etc.' />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="User-Agent, Allow, Disallow, Content-Usage" {...field} />
                          </FormControl>
                          <FormDescription>Comma-separated</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="trigger"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Trigger
                            <FieldTooltip content='What triggers your bot: fetcher, scheduled, manual' />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="fetcher" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="purpose"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Purpose
                            <FieldTooltip content='Bot purpose: tdm (text/data mining), etc.' />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="tdm" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="targeted_content"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Targeted Content
                            <FieldTooltip content="Type of content your bot targets" />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="Cat pictures" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="rate_control"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Rate Control
                            <FieldTooltip content='HTTP status code for rate limiting (typically 429)' />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="429" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="rate_expectation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Rate Expectation
                            <FieldTooltip content='Expected rate: avg=10rps;max=100rps' />
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="avg=10rps;max=100rps" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="known_urls"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Known URLs
                            <FieldTooltip content='URL patterns your bot accesses (wildcards supported)' />
                          </FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="/, /robots.txt, *.png" 
                              className="min-h-[100px]"
                              {...field} 
                            />
                          </FormControl>
                          <FormDescription>Comma-separated</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-4">
                      <Button type="submit" className="flex-1">
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </Button>
                      <Button type="button" variant="outline" onClick={() => navigate(`/${username}`)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Form>
              </TooltipProvider>
            </CardContent>
          </Card>

          <Card className="h-fit sticky top-6">
            <CardHeader>
              <CardTitle>JWKS Preview</CardTitle>
              <CardDescription>Live preview of your JWKS endpoint</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-muted rounded-lg p-4 overflow-auto max-h-[600px]">
                <pre className="text-xs">{JSON.stringify(previewData, null, 2)}</pre>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default EditProfile;

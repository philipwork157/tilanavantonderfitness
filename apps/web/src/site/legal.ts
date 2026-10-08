// Copied from the live site's privacy and refund pages (apps/web/src/pages). Keep in sync.
import { site } from './config';

export const privacySections = [
  {
    title: 'Who is responsible for your information?',
    body: [
      `Tilana van Tonder is the responsible party for the personal information described in this policy. Privacy questions and requests can be sent to ${site.email}.`,
      'This website and its services are operated from South Africa and this policy is intended to support the requirements of the Protection of Personal Information Act 4 of 2013 (POPIA).',
    ],
  },
  {
    title: 'What information is collected?',
    body: [
      'If you submit an enquiry from the contact page, you provide your name, email address, selected area of interest, message and consent confirmation. Supplying an enquiry is voluntary, but a name, reply address and enough context are needed to respond meaningfully.',
      'If you join the newsletter, the website collects your email address, consent date, signup source, confirmation status and the applicable privacy-policy version. Newsletter subscription is voluntary and uses a confirmation email before marketing messages are sent.',
      'If you buy one or more programs, the checkout collects your name, email address, optional phone number, the programs you selected, and the order, payment and email delivery status. Card and bank details are entered directly into Paystack and are not stored by this website.',
      'Purchased programs are delivered as PDF files attached to an email sent to the address you entered at checkout. You do not need an account. If you ask for your programs to be sent again, the website uses your email address to find your paid orders.',
      'Please do not send diagnoses, medical records, identity numbers, detailed injury information, pregnancy complications or other sensitive health information through the public contact form.',
      'The website uses Cloudflare Web Analytics to understand aggregate visits and website performance. Cloudflare Web Analytics does not use cookies, local storage or fingerprinting to identify or track individual visitors. The website also stores a light-or-dark theme preference in your browser. The hosting provider may process standard technical information such as an IP address, browser information and security logs to deliver and protect the site.',
    ],
  },
  {
    title: 'How does the contact form work?',
    body: [
      `The contact form submits your enquiry to a protected server endpoint. After validation and anti-spam checks, the enquiry is stored in the private administration database and Tilana may receive an email notification at ${site.email}.`,
    ],
  },
  {
    title: 'Why is information used?',
    body: [
      'Information is used to respond to your enquiry, understand which service you are asking about, assess whether Tilana can assist, recommend an appropriately qualified professional when the request falls outside her scope, and take requested steps before a possible client relationship.',
      'Newsletter information is used only to confirm and manage your subscription and send the occasional emails you requested. It is not added from a contact enquiry unless you separately subscribe.',
      'Purchase information is used to process and reconcile payment, prevent duplicate orders, email your programs and an order summary, resend them when you ask, provide customer support and keep the business records the law requires. Tilana receives a short email notification of each sale.',
      'If you later become a client, additional information will be collected through a separate onboarding process with its own explanations and consent choices. Contact details are not added to a marketing list unless separate, optional marketing consent is requested in future.',
    ],
  },
  {
    title: 'Who may receive the information?',
    body: [
      'Personal information is not sold. It may be processed by service providers that are reasonably necessary to run the website, secure it, provide email, store records or meet professional and legal obligations. Information may also be disclosed where required by law or with your specific permission.',
      'Cloudflare hosts and protects the public website, provides privacy-focused analytics and helps prevent automated spam through Turnstile. Cloudflare may process technical information such as an IP address, browser details and security events when delivering or protecting the website.',
      'Supabase provides the protected database and sign-in used for website enquiries, newsletter subscription records, orders and authorised administration data. Amazon Web Services Simple Email Service (AWS SES) delivers contact notifications, newsletter emails and purchase emails with the program files attached; it processes the recipient address and the information needed to deliver each message.',
      'Paystack processes program payments and related payment information. Cloudflare R2 privately stores the program files that are attached to purchase emails.',
      'These providers may process or store information outside South Africa. Where that occurs, reasonable steps will be taken to use providers and arrangements that offer an adequate level of protection and appropriate contractual, organisational and technical safeguards.',
    ],
  },
  {
    title: 'How long is information kept?',
    body: [
      'Enquiry information is kept only for as long as reasonably necessary to respond, manage follow-up, resolve a concern or maintain an appropriate business record. Enquiries that are no longer needed are periodically deleted. If you become a client, relevant records may be retained for the relationship and for any applicable contractual, accounting or legal obligations.',
      'A newsletter subscription is kept while it remains active. If you unsubscribe, the address and suppression status may be retained only as needed to honour the opt-out and prevent accidental resubscription. Expired confirmation records are periodically deleted.',
      'Order and payment records are kept for as long as needed to support your purchase, resend your programs and meet accounting and tax record-keeping obligations. Incomplete checkouts that never became a paid order are periodically deleted.',
    ],
  },
  {
    title: 'How is information protected?',
    body: [
      'Reasonable technical and organisational safeguards are used to protect information against loss, misuse, unauthorised access or disclosure. No internet or email system can be guaranteed completely secure, so sensitive health or identity documents should never be sent through the public enquiry form.',
    ],
  },
  {
    title: 'Your choices and rights',
    body: [
      `You may ask whether Tilana holds personal information about you, request access to it, ask for inaccurate information to be corrected, request deletion where retention is no longer authorised, withdraw consent where processing relies on consent, or object to certain processing. Send a request to ${site.email}; reasonable identity verification may be required before information is released or changed.`,
    ],
  },
  {
    title: 'Children',
    body: [
      'The enquiry form and paid services are intended for adults aged 18 or older. A child should not submit personal information through the website. A separate guardian-reviewed process would be required before working with anyone under 18.',
    ],
  },
] as const;

export const refundSections = [
  {
    title: 'What this policy covers',
    body: [
      'This policy applies to once-off purchases of digital programmes sold by Tilana van Tonder through this website. Each programme is a PDF document with general educational content. They are not subscriptions and do not renew automatically.',
      'Nothing in this policy limits any right or remedy that cannot lawfully be excluded under South African consumer law.',
    ],
  },
  {
    title: 'How programmes are delivered',
    body: [
      'As soon as Paystack confirms your payment, your programme is emailed to the address you entered at checkout, with the PDF attached. If you bought more than one programme, they may arrive together or in separate emails.',
      'If the email has not arrived within an hour, please check your spam or promotions folder first. You can ask for your programmes to be sent again from the checkout page, or email us and we will resend them.',
    ],
  },
  {
    title: 'Changing your mind',
    body: [
      'Because the programme is a digital file that is delivered to you immediately after payment and cannot be returned, a change-of-mind refund is not normally available once the email with your programme has been sent, except where the law requires one.',
      `If you believe you are entitled to cancel, please email ${site.email} within 7 calendar days of purchase with the purchase email address, order number and programme name, and we will respond fairly and in line with the law.`,
    ],
  },
  {
    title: 'When a refund will be considered',
    body: [
      'Please contact us if you were charged more than once for the same intended purchase, paid the wrong amount because of a website error, did not receive your programme after a successful payment, or received a file that is materially different from its description, is damaged or cannot reasonably be opened.',
      'We will first try to fix the problem, for example by sending the correct or a working file. If it cannot be resolved within a reasonable time, an appropriate full or partial refund will be offered. A partial refund will be agreed with you before it is processed.',
    ],
  },
  {
    title: 'Cancellations and failed payments',
    body: [
      'There is no recurring membership to cancel. You may leave checkout before completing payment without creating an ongoing payment obligation.',
      'A pending, failed or abandoned payment is not treated as a completed purchase and no programme is sent. If your bank shows a debit but the website does not confirm payment, please do not pay again. Contact us with the Paystack reference so the transaction can be investigated first.',
    ],
  },
  {
    title: 'How to request a refund',
    body: [
      `Email ${site.email} with your full name, purchase email address, programme name, order number or Paystack reference, purchase date, and a short explanation of the request. Do not send card numbers, bank login details or one-time PINs.`,
      'We will acknowledge the request and may ask for information reasonably needed to locate the transaction or understand the problem. Decisions are based on the purchase and delivery records, this policy and applicable law.',
    ],
  },
  {
    title: 'How refunds are paid',
    body: [
      'Approved refunds are returned through Paystack to the original payment method. Paystack advises that customers can generally expect a processed refund within 3 to 10 working days, although the customer bank may affect the final timing.',
      'Programmes are for your own personal use. If you receive a full refund, please delete the programme files you received for that order.',
    ],
  },
  {
    title: 'Contact and business details',
    body: [
      `Seller: ${site.name}, sole proprietor. Email: ${site.email}. Business address: Ternberry Village, Cleveland 31, Cape Town, Western Cape, 7580, South Africa.`,
      'Please contact us first if you have a question or complaint about a purchase. We will try to resolve it fairly and keep a written record of the outcome.',
    ],
  },
] as const;

export const privacySummary = {
  eyebrow: 'Your information',
  title: 'Privacy,',
  script: 'explained clearly.',
  intro: 'A practical summary of what this website collects, why it is needed, and the choices you have.',
  heading: 'Only what is needed.',
  points: [
    'Enquiries stored securely for follow-up',
    'Programs delivered by email, no account needed',
    'Cookie-free, privacy-focused analytics',
    'Newsletter only with confirmation',
    'No sale of personal information',
    'No health records through the public form',
  ],
  effective: '7 October 2026',
};

export const refundSummary = {
  eyebrow: 'Purchasing with confidence',
  title: 'Refunds,',
  script: 'explained clearly.',
  intro: 'How delivery, cancellations, duplicate payments and refund requests are handled for digital programme purchases.',
  heading: 'A fair, clear process.',
  points: [
    'Once-off digital purchases',
    'PDF emailed straight after payment',
    'Missing or faulty files fixed first',
    'Duplicate charges investigated',
    'Statutory rights remain protected',
  ],
  effective: '7 October 2026',
};

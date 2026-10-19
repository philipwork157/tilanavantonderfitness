// Shared policy content for the public website's legal pages.
import { site } from './config';

export const privacySections = [
  {
    title: 'Who is responsible for your information?',
    body: [
      `Tilana van Tonder is the responsible party for the personal information described in this policy. Privacy questions and requests can be sent through ${site.url}/contact.`,
      'This website and its services are operated from South Africa and this policy is intended to support the requirements of the Protection of Personal Information Act 4 of 2013 (POPIA).',
    ],
  },
  {
    title: 'What information is collected?',
    body: [
      'If you submit an enquiry from the contact page, you provide your name, email address, selected area of interest, message and consent confirmation. Supplying an enquiry is voluntary, but a name, reply address and enough context are needed to respond meaningfully.',
      'If you join the newsletter, the website collects your email address, consent date, signup source and confirmation status. Newsletter subscription is voluntary and uses a confirmation email before marketing messages are sent.',
      'If you buy one or more programs, the checkout collects your name, email address, optional phone number, the programs you selected, and the order, payment and email delivery status. Card and bank details are entered directly into Paystack and are not stored by this website.',
      'Purchased programs are delivered as PDF files attached to an email sent to the address you entered at checkout. You do not need an account. If you ask for your programs to be sent again, the website uses your email address to find your paid orders.',
      'Each program PDF you buy is personalised with your name, order number and purchase date, to discourage unauthorised sharing. Your email address and phone number are not printed on it.',
      'Please do not send diagnoses, medical records, identity numbers, detailed injury information, pregnancy complications or other sensitive health information through the public contact form.',
      'The website uses a privacy-focused analytics service to understand aggregate visits and website performance. It does not use cookies, local storage or fingerprinting to identify or track individual visitors.',
      'The website also uses a product analytics service to understand which pages are viewed and how many people add a program to the basket, start checkout or complete a purchase. The website configures it in cookieless mode, with person profiles, session recordings and surveys disabled. The analytics integration does not intentionally send your name, email address or message content, and removes sign-in tokens, email addresses, pre-filled messages and payment references from page addresses before sending events. The analytics service also receives technical information such as browser details and an IP address when receiving those events.',
      'The website stores a few things in your own browser, never sent anywhere for tracking: your light-or-dark theme preference, the programs in your basket, a payment reference for a checkout you started, without your name or contact details (so the payment is matched to the right order when you return from Paystack), and whether you closed the WhatsApp greeting. You can clear them at any time in your browser settings. The hosting provider may process standard technical information such as an IP address, browser information and security logs to deliver and protect the site.',
    ],
  },
  {
    title: 'How does the contact form work?',
    body: [
      `The contact form submits your enquiry to a protected server endpoint. After validation and anti-spam checks, the enquiry is stored in the private administration database and Tilana may receive an email notification.`,
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
      'These service providers include website hosting, security and spam-protection services, which may process technical information such as an IP address, browser details and security events; cookieless website analytics, hosted in the European Union, which process page visits and website actions to provide usage statistics; secure cloud database, file storage and server providers, which store enquiries, newsletter records, orders and program files; and email delivery services, which process the recipient address and the information needed to deliver contact, newsletter and purchase emails.',
      'Program payments are processed by Paystack, which handles your payment information under its own privacy policy. Card details are entered on Paystack’s secure payment page and are never received or stored by this website.',
      'These providers may process or store information outside South Africa. Where that occurs, reasonable steps will be taken to use providers and arrangements that offer an adequate level of protection and appropriate contractual, organisational and technical safeguards. A list of the current service providers is available on request through the contact page.',
    ],
  },
  {
    title: 'If you choose WhatsApp',
    body: [
      'The WhatsApp button opens an external service. If you choose to use it, WhatsApp handles the information you share under its own privacy policy. WhatsApp is optional; you can use the website contact form instead. Please do not send sensitive health records, identity documents, card details or bank login details through WhatsApp.',
    ],
  },
  {
    title: 'How long is information kept?',
    body: [
      'Enquiry information is kept only for as long as reasonably necessary to respond, manage follow-up, resolve a concern or maintain an appropriate business record. If you become a client, relevant records may be retained for the relationship and for any applicable contractual, accounting or legal obligations.',
      'A newsletter subscription is kept while it remains active. If you unsubscribe, the address and suppression status may be retained only as needed to honour the opt-out and prevent accidental resubscription. An expired confirmation link cannot confirm a subscription, but expiry does not automatically delete the subscription record.',
      'Order and payment records are kept for as long as needed to support your purchase, resend your programs and meet accounting and tax record-keeping obligations. An incomplete or abandoned checkout does not automatically delete its record.',
      'You can ask through the contact page for a review of information held about you and for deletion where it is no longer needed for an authorised purpose. Information that must be kept for a legal obligation or an unresolved dispute may be retained for that purpose.',
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
      `You may ask whether Tilana holds personal information about you, request access to it, ask for inaccurate information to be corrected, request deletion where retention is no longer authorised, withdraw consent where processing relies on consent, or object to certain processing. Send a request through the contact page; reasonable identity verification may be required before information is released or changed.`,
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
      'This policy applies to once-off purchases of digital programs sold by Tilana van Tonder through this website. Each program is a PDF document with general educational content. They are not subscriptions and do not renew automatically.',
      'Nothing in this policy limits any right or remedy that cannot lawfully be excluded under South African consumer law.',
    ],
  },
  {
    title: 'How programs are delivered',
    body: [
      'As soon as Paystack confirms your payment, your program is emailed to the address you entered at checkout, with the PDF attached. If you bought more than one program, they may arrive together or in separate emails.',
      `If the email has not arrived within an hour, please check your spam or promotions folder first. If it is not there, send a message through the contact page with your order number and we will send your programs again.`,
    ],
    action: { label: 'Ask for my programs again', kind: 'resend' },
  },
  {
    title: 'Changing your mind',
    body: [
      'Where the cooling-off right in section 44 of the Electronic Communications and Transactions Act applies to a purchase of goods, you may cancel without a reason or penalty within 7 calendar days after receiving them. The Act includes exceptions in section 42(2), including for books. Any exception must apply to the particular purchase; a PDF being emailed or downloaded does not, by itself, remove statutory rights.',
      'To request a cancellation, contact us promptly with your purchase email address, order number and program name. We will assess the request under the law that applies to your purchase and explain the outcome. Where section 44 applies, the payment will be refunded within 30 days of cancellation. This does not limit any other cancellation right or remedy, including for non-delivery or a faulty or misdescribed program.',
    ],
  },
  {
    title: 'When a refund will be considered',
    body: [
      'Please contact us if you were charged more than once for the same intended purchase, paid the wrong amount because of a website error, did not receive your program after a successful payment, or received a file that is materially different from its description, is damaged or cannot reasonably be opened.',
      'We will try to fix the problem, for example by sending the correct or a working file, unless you are entitled to a different remedy under the law. If the problem cannot be resolved within a reasonable time, we will provide the refund or other remedy required by law. We will confirm the outcome and any refund amount with you before processing it.',
    ],
  },
  {
    title: 'Cancellations and failed payments',
    body: [
      'There is no recurring membership to cancel. You may leave checkout before completing payment without creating an ongoing payment obligation.',
      'A pending, failed or abandoned payment is not treated as a completed purchase and no program is sent. If your bank shows a debit but the website does not confirm payment, please do not pay again. Contact us with the Paystack reference so the transaction can be investigated first.',
    ],
  },
  {
    title: 'How to request a refund',
    body: [
      `Send a message through the contact page with your full name, purchase email address, program name, order number or Paystack reference, purchase date, and a short explanation of the request. Do not send card numbers, bank login details or one-time PINs.`,
      'We aim to acknowledge your request within 2 working days and give you a decision within 5 working days of receiving the information reasonably needed to locate the transaction and understand the problem. If more time is needed, we will explain why and keep you updated. Working days exclude weekends and South African public holidays. These service targets do not extend any deadline required by law.',
      'Approved refunds are submitted through Paystack without undue delay. We will confirm submission and keep you informed if Paystack requires further action or a delay occurs. Payment-provider or funding delays do not remove our responsibility to meet any refund deadline required by law.',
    ],
    action: { label: 'Request a refund', kind: 'refund' },
  },
  {
    title: 'How refunds are paid',
    body: [
      'Approved refunds are returned through Paystack to the original payment method. Paystack advises that customers can generally expect a processed refund within 3 to 10 working days, although the customer bank may affect the final timing.',
      'Programs are for your own personal use. If you receive a full refund, please delete the program files you received for that order.',
    ],
  },
  {
    title: 'Contact and business details',
    body: [
      `Seller: ${site.name}, a sole proprietor trading in South Africa. Contact: ${site.url}/contact. Website: ${site.url}.`,
      'Please contact us if you have a question or complaint about a purchase so we can try to resolve it fairly and keep a written record of the outcome. This does not prevent you from contacting your bank or a relevant consumer authority, or exercising any dispute rights within the applicable time limits.',
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
  effective: '17 October 2026',
};

export const refundSummary = {
  eyebrow: 'Purchasing with confidence',
  title: 'Refunds,',
  script: 'explained clearly.',
  intro: 'How delivery, cancellations, duplicate payments and refund requests are handled for digital program purchases.',
  heading: 'A fair, clear process.',
  points: [
    'Once-off digital purchases',
    'PDF emailed straight after payment',
    'Help with missing or faulty files',
    'Duplicate charges investigated',
    'Aim to reply within 2 working days',
    'Statutory rights remain protected',
  ],
  effective: '17 October 2026',
};

/** Terms of sale and use, read together with the refund and privacy policies. */
export const termsSections = [
  {
    title: 'Who you are buying from',
    body: [
      `Programs on this website (${site.url}) are sold by ${site.name}, a sole proprietor trading in South Africa. You can reach us through the contact page at ${site.url}/contact.`,
      'These terms apply to every purchase on this website and to using the website itself. By buying a program you confirm that you have read them, together with the refund and cancellation policy and the privacy policy.',
      'You must be 18 or older to buy a program.',
    ],
  },
  {
    title: 'What you are buying',
    body: [
      'Each program is a digital training guide in PDF format. The program page describes what it contains, and the sneak peek shows sample pages. Nothing physical is posted to you.',
      'Programs are once-off purchases. There is no subscription, no recurring charge and no account to create.',
    ],
  },
  {
    title: 'Prices and payment',
    body: [
      'Prices are shown in South African rand (ZAR) and are the full amount you pay for the program. Tilana van Tonder is not registered for VAT, so no VAT is charged. The total for your basket is shown before you pay.',
      'Payments are processed by Paystack, a licensed payment provider. You can pay by card (Visa or Mastercard) or with any other payment method shown on Paystack’s payment page. Card and bank details are entered on Paystack’s secure payment page and never reach this website. Paystack uses encryption and industry security standards to protect payments.',
      'An order is only complete once Paystack confirms the payment. If a price on the website is clearly wrong, the order may be cancelled and fully refunded before the program is sent.',
    ],
  },
  {
    title: 'Delivery',
    body: [
      'Your program is emailed to the address you enter at checkout as soon as Paystack confirms your payment, with the PDF attached. Please check the address carefully before paying.',
      `If nothing has arrived within an hour, check your spam or promotions folder, then send a message through the contact page with your order number and the program will be sent again.`,
      'The email also shows your order number and the programs you bought. Please keep it, together with your Paystack payment confirmation, as your record of the purchase. We keep a record of every order and can confirm its details on request.',
    ],
  },
  {
    title: 'Cancellations and refunds',
    body: [
      'Your cancellation and refund rights are explained in the refund and cancellation policy, which forms part of these terms. Email delivery or downloading a PDF does not, by itself, remove any statutory right that applies. Nothing in these terms takes away rights you have under the Consumer Protection Act or the Electronic Communications and Transactions Act.',
    ],
  },
  {
    title: 'Your licence to use the program',
    body: [
      'You may download, print and use the program for your own personal training. The program remains the intellectual property of Tilana van Tonder.',
      'Each copy is personalised for its buyer: your name, order number and purchase date are printed on its pages, and the order number is also stored in the file, so a shared copy can be traced to its order.',
      'You may not share, resell, upload, publish or copy the program for other people, or use it to train clients, without written permission.',
    ],
  },
  {
    title: 'Health and safety',
    body: [
      'The programs and website content provide general fitness and lifestyle education. They are not medical advice, a diagnosis or a treatment plan, and they do not replace private training or care from a qualified health professional who knows your history.',
      'Please speak to your doctor before starting a new exercise program, especially if you are pregnant, injured, recovering from illness or have a medical condition. Stop exercising and get medical help if you feel pain, dizziness or shortness of breath.',
      'You train at your own pace and within your own limits. To the extent the law allows, Tilana van Tonder is not responsible for injury or loss caused by exercises done incorrectly or against this advice.',
    ],
  },
  {
    title: 'Using the website',
    body: [
      'Please do not misuse the website, for example by trying to break its security, sending automated requests or submitting false orders or enquiries.',
      'The website and its content are provided as they are. Reasonable care is taken to keep them accurate and available, but the website may sometimes be unavailable for maintenance or reasons outside our control.',
    ],
  },
  {
    title: 'Privacy',
    body: [
      'Personal information you share when buying a program, subscribing or making an enquiry is handled as described in the privacy policy.',
    ],
  },
  {
    title: 'Law, complaints and changes',
    body: [
      'These terms are governed by the laws of the Republic of South Africa.',
      `Please get in touch through the contact page first with any question or complaint, and we will try to resolve it fairly. You may also approach the National Consumer Commission or another consumer protection body.`,
      'These terms may be updated from time to time. The version shown on this page when you buy applies to that purchase.',
    ],
  },
] as const;

export const termsSummary = {
  eyebrow: 'Buying a program',
  title: 'Terms of sale,',
  script: 'in plain words.',
  intro: 'Who you are buying from, what you get, how payment and delivery work, and how to use your program safely.',
  heading: 'Simple and fair.',
  points: [
    'Once-off digital PDF programs',
    'Prices in rand, no VAT, paid securely through Paystack',
    'Emailed straight after payment',
    'For your own personal use',
    'General education, not medical advice',
    'Your consumer rights stay protected',
  ],
  effective: '17 October 2026',
};


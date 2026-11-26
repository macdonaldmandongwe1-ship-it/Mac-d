import { CustomerPaymentMethod } from '../types';

export interface CountryPaymentMethodDetail {
  localLabel: string;
  localHint: string;
  customerFieldLabel: string;
  customerPlaceholder: string;
  mechanicHandleLabel: string;
  mechanicHandlePlaceholder: string;
  mechanicUriLabel: string;
  mechanicUriPlaceholder: string;
  checkoutInstructions: string;
}

export interface CountryPaymentProfile {
  code: string;
  name: string;
  currencyCode: string;
  currencySymbol: string;
  approxUsdRate: number;
  recommendedMethods: CustomerPaymentMethod[];
  defaultMethod: CustomerPaymentMethod;
  localNoteBanner: string;
  methodOverrides: Partial<Record<CustomerPaymentMethod, CountryPaymentMethodDetail>>;
}

export const COUNTRY_PAYMENT_PROFILES: CountryPaymentProfile[] = [
  {
    code: 'US',
    name: 'United States',
    currencyCode: 'USD',
    currencySymbol: '$',
    approxUsdRate: 1,
    recommendedMethods: ['card', 'digital_wallet', 'cash', 'bank_transfer'],
    defaultMethod: 'card',
    localNoteBanner: 'US rails: Visa/Mastercard/Amex, Zelle, Venmo, Cash App, Apple Pay, ACH, or USD cash.',
    methodOverrides: {
      card: {
        localLabel: 'Card / Apple Pay',
        localHint: 'Visa · Mastercard · Amex · Discover',
        customerFieldLabel: 'Card / Tap-to-Pay Note',
        customerPlaceholder: 'e.g. Visa / Apple Pay on arrival',
        mechanicHandleLabel: 'Stripe / Square / Tap-to-Pay Tag',
        mechanicHandlePlaceholder: '@company-repairs-us',
        mechanicUriLabel: 'Card Checkout Link / Stripe URI',
        mechanicUriPlaceholder: 'https://pay.wrenchbid.app/us-card',
        checkoutInstructions: 'Pay via Stripe/Square card link or Tap-to-Pay with the mechanic team.',
      },
      digital_wallet: {
        localLabel: 'Zelle / Venmo / Cash App',
        localHint: 'Instant US peer wallet',
        customerFieldLabel: 'Your Wallet App (Zelle / Venmo / Cash App)',
        customerPlaceholder: 'e.g. Zelle @driver or Cash App',
        mechanicHandleLabel: 'Zelle / Venmo / Cash App Handle',
        mechanicHandlePlaceholder: '$ApexRoadsideUS / zelle@shop.com',
        mechanicUriLabel: 'Wallet Payment Link / QR URI',
        mechanicUriPlaceholder: 'https://venmo.com/u/apexroadside',
        checkoutInstructions: 'Send directly to the workshop company Venmo, Zelle, Cash App, or PayPal QR.',
      },
      bank_transfer: {
        localLabel: 'ACH / Wire Transfer',
        localHint: 'US bank routing & account',
        customerFieldLabel: 'Bank Transfer Reference',
        customerPlaceholder: 'e.g. Same-day ACH / Wire',
        mechanicHandleLabel: 'Company Routing / Account Alias',
        mechanicHandlePlaceholder: 'Routing ****1120 · Acct ****8841',
        mechanicUriLabel: 'Bank Payment Instructions / URI',
        mechanicUriPlaceholder: 'https://pay.wrenchbid.app/ach',
        checkoutInstructions: 'Complete ACH/wire using the mechanic company banking reference on site.',
      },
    },
  },
  {
    code: 'KE',
    name: 'Kenya',
    currencyCode: 'KES',
    currencySymbol: 'KSh',
    approxUsdRate: 129,
    recommendedMethods: ['mobile_money', 'cash', 'bank_transfer', 'card'],
    defaultMethod: 'mobile_money',
    localNoteBanner: 'Kenya rails: M-Pesa Till / Paybill / Pochi la Biashara, Airtel Money, PesaLink, or KES cash.',
    methodOverrides: {
      mobile_money: {
        localLabel: 'M-Pesa / Airtel Money',
        localHint: 'Till · Paybill · Send Money',
        customerFieldLabel: 'M-Pesa / Airtel Rail & Phone Ref',
        customerPlaceholder: 'e.g. M-Pesa STK Push / Till KES',
        mechanicHandleLabel: 'M-Pesa Till / Paybill / Phone',
        mechanicHandlePlaceholder: 'Till 5482910 or +254 712 345678',
        mechanicUriLabel: 'M-Pesa QR / Payment URI',
        mechanicUriPlaceholder: 'mpesa://pay?till=5482910',
        checkoutInstructions: 'Lipa na M-Pesa (Till/Paybill) or Airtel Money directly to the workshop company.',
      },
      bank_transfer: {
        localLabel: 'PesaLink / RTGS',
        localHint: 'Instant Kenyan bank transfer',
        customerFieldLabel: 'Kenyan Bank / PesaLink Note',
        customerPlaceholder: 'e.g. Equity / KCB PesaLink KES',
        mechanicHandleLabel: 'Bank Paybill / Account Name',
        mechanicHandlePlaceholder: 'KCB Paybill 522522 · Acct 1184...',
        mechanicUriLabel: 'Bank QR / Reference URI',
        mechanicUriPlaceholder: 'pesalink://acct/11840022',
        checkoutInstructions: 'Transfer via PesaLink or bank app using the company Till/Account details.',
      },
    },
  },
  {
    code: 'NG',
    name: 'Nigeria',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    approxUsdRate: 1580,
    recommendedMethods: ['bank_transfer', 'mobile_money', 'card', 'cash'],
    defaultMethod: 'bank_transfer',
    localNoteBanner: 'Nigeria rails: Instant NIP Bank Transfer, OPay, PalmPay, Kuda, Verve/Visa/Mastercard, or NGN cash.',
    methodOverrides: {
      bank_transfer: {
        localLabel: 'NIP / OPay / PalmPay',
        localHint: 'Instant Nigerian bank transfer',
        customerFieldLabel: 'Transfer Bank / App (OPay / GTB / Access)',
        customerPlaceholder: 'e.g. OPay / Kuda Instant NGN',
        mechanicHandleLabel: 'Company NUBAN Account & Bank',
        mechanicHandlePlaceholder: '0123456789 · GTBank / OPay',
        mechanicUriLabel: 'NIBSS / Bank QR URI',
        mechanicUriPlaceholder: 'nibss://pay?acct=0123456789',
        checkoutInstructions: 'Send instant Naira bank transfer (NIP / OPay / PalmPay) to the company account.',
      },
      mobile_money: {
        localLabel: 'OPay / Paga / MoMo PSB',
        localHint: 'Nigerian mobile wallet',
        customerFieldLabel: 'Mobile Wallet Handle',
        customerPlaceholder: 'e.g. PalmPay / MTN MoMo PSB',
        mechanicHandleLabel: 'OPay / MoMo Wallet Phone',
        mechanicHandlePlaceholder: '+234 803 000 1122',
        mechanicUriLabel: 'Wallet QR URI',
        mechanicUriPlaceholder: 'momo://ng/2348030001122',
        checkoutInstructions: 'Pay via OPay, PalmPay, Paga, or MoMo PSB QR code.',
      },
    },
  },
  {
    code: 'GH',
    name: 'Ghana',
    currencyCode: 'GHS',
    currencySymbol: 'GH₵',
    approxUsdRate: 15.6,
    recommendedMethods: ['mobile_money', 'cash', 'card', 'bank_transfer'],
    defaultMethod: 'mobile_money',
    localNoteBanner: 'Ghana rails: MTN MoMo, Telecel Cash, AT Money, GhQR, Visa/Mastercard, or GHS cash.',
    methodOverrides: {
      mobile_money: {
        localLabel: 'MTN MoMo / Telecel Cash',
        localHint: 'MoMo Merchant ID · GhQR',
        customerFieldLabel: 'Network (MTN MoMo / Telecel / AT)',
        customerPlaceholder: 'e.g. MTN MoMo Merchant GHS',
        mechanicHandleLabel: 'MoMo Merchant ID / Number',
        mechanicHandlePlaceholder: 'MoMo Merchant 449201 · 024...',
        mechanicUriLabel: 'GhQR / MoMo Payment URI',
        mechanicUriPlaceholder: 'momo://gh/merchant/449201',
        checkoutInstructions: 'Approve MTN MoMo, Telecel Cash, or scan GhQR directly to the workshop.',
      },
    },
  },
  {
    code: 'ZA',
    name: 'South Africa',
    currencyCode: 'ZAR',
    currencySymbol: 'R',
    approxUsdRate: 18.2,
    recommendedMethods: ['card', 'bank_transfer', 'digital_wallet', 'cash'],
    defaultMethod: 'bank_transfer',
    localNoteBanner: 'South Africa rails: PayShap, Instant EFT, SnapScan / Zapper QR, Card, or ZAR cash.',
    methodOverrides: {
      bank_transfer: {
        localLabel: 'PayShap / Instant EFT',
        localHint: 'ShapID · Ozow · Instant EFT',
        customerFieldLabel: 'PayShap / Bank App',
        customerPlaceholder: 'e.g. FNB / Capitec PayShap',
        mechanicHandleLabel: 'ShapID / Company Bank Acct',
        mechanicHandlePlaceholder: '0821112233@fnb · FNB Bus.',
        mechanicUriLabel: 'PayShap / EFT URI',
        mechanicUriPlaceholder: 'payshap://0821112233@fnb',
        checkoutInstructions: 'Pay via PayShap ShapID or Instant EFT to the mechanic company.',
      },
      digital_wallet: {
        localLabel: 'SnapScan / Zapper QR',
        localHint: 'South African QR wallets',
        customerFieldLabel: 'QR Wallet App',
        customerPlaceholder: 'e.g. SnapScan / Zapper',
        mechanicHandleLabel: 'SnapScan / Zapper Merchant',
        mechanicHandlePlaceholder: 'SnapScan ID #WB-4821',
        mechanicUriLabel: 'SnapScan / Zapper QR URI',
        mechanicUriPlaceholder: 'https://pos.snapscan.io/qr/WB4821',
        checkoutInstructions: 'Scan the company SnapScan or Zapper QR code to settle in ZAR.',
      },
    },
  },
  {
    code: 'ZW',
    name: 'Zimbabwe',
    currencyCode: 'USD',
    currencySymbol: '$',
    approxUsdRate: 1,
    recommendedMethods: ['mobile_money', 'cash', 'bank_transfer', 'card'],
    defaultMethod: 'mobile_money',
    localNoteBanner: 'Zimbabwe rails: EcoCash, InnBucks, O’mari, OneMoney, ZimSwitch / ZIPIT, Visa/Mastercard, or USD / ZiG cash.',
    methodOverrides: {
      mobile_money: {
        localLabel: 'EcoCash / InnBucks / O’mari',
        localHint: 'EcoCash USD · InnBucks · OneMoney · O’mari',
        customerFieldLabel: 'Mobile Wallet (EcoCash / InnBucks / O’mari)',
        customerPlaceholder: 'e.g. EcoCash USD / InnBucks',
        mechanicHandleLabel: 'EcoCash Merchant / InnBucks Phone',
        mechanicHandlePlaceholder: 'EcoCash *151# Merchant 48291 · +263 77...',
        mechanicUriLabel: 'EcoCash / InnBucks QR URI',
        mechanicUriPlaceholder: 'ecocash://pay?merchant=48291',
        checkoutInstructions: 'Pay directly via EcoCash USD (*151#), InnBucks, O’mari, or OneMoney using the workshop merchant code or QR.',
      },
      bank_transfer: {
        localLabel: 'ZIPIT / ZimSwitch Transfer',
        localHint: 'Instant Zimbabwean bank transfer',
        customerFieldLabel: 'Bank / ZIPIT App (CBZ / CABS / FBC / Stanbic)',
        customerPlaceholder: 'e.g. ZIPIT Instant USD / ZiG',
        mechanicHandleLabel: 'Company Bank & ZIPIT Account',
        mechanicHandlePlaceholder: 'CBZ / CABS · Acct 01122334455',
        mechanicUriLabel: 'ZIPIT / ZimSwitch Reference URI',
        mechanicUriPlaceholder: 'zipit://pay?acct=01122334455',
        checkoutInstructions: 'Send an instant ZIPIT or ZimSwitch bank transfer directly to the workshop company account.',
      },
      card: {
        localLabel: 'ZimSwitch / Visa / Mastercard',
        localHint: 'ZimSwitch POS · Visa · Mastercard',
        customerFieldLabel: 'Card Network Note',
        customerPlaceholder: 'e.g. ZimSwitch / Visa USD',
        mechanicHandleLabel: 'POS / Card Merchant Tag',
        mechanicHandlePlaceholder: 'ZimSwitch / Visa POS #ZW-204',
        mechanicUriLabel: 'Card Checkout QR / URI',
        mechanicUriPlaceholder: 'https://pay.wrenchbid.app/zw-card',
        checkoutInstructions: 'Tap or swipe ZimSwitch, Visa, or Mastercard on arrival or pay via the checkout link.',
      },
      cash: {
        localLabel: 'Cash (USD / ZiG)',
        localHint: 'Direct USD or ZiG cash on site',
        customerFieldLabel: 'Cash Currency Note',
        customerPlaceholder: 'e.g. Paying USD cash on arrival',
        mechanicHandleLabel: 'Cash Receipt / Workshop Name',
        mechanicHandlePlaceholder: 'USD / ZiG Cash accepted on site',
        mechanicUriLabel: 'Fallback QR / Backup URI',
        mechanicUriPlaceholder: 'https://pay.wrenchbid.app/zw-cash',
        checkoutInstructions: 'Pay USD or ZiG cash directly to the mechanic crew on site (0% platform fee).',
      },
    },
  },
  {
    code: 'IN',
    name: 'India',
    currencyCode: 'INR',
    currencySymbol: '₹',
    approxUsdRate: 84,
    recommendedMethods: ['upi', 'card', 'bank_transfer', 'cash'],
    defaultMethod: 'upi',
    localNoteBanner: 'India rails: UPI (Google Pay, PhonePe, Paytm, BHIM), IMPS/NEFT, RuPay/Card, or INR cash.',
    methodOverrides: {
      upi: {
        localLabel: 'UPI (GPay / PhonePe / Paytm)',
        localHint: 'Instant NPCI BHIM UPI QR',
        customerFieldLabel: 'UPI App Preference',
        customerPlaceholder: 'e.g. Google Pay / PhonePe UPI',
        mechanicHandleLabel: 'Company UPI VPA ID',
        mechanicHandlePlaceholder: 'apexmechanics@okicici',
        mechanicUriLabel: 'UPI Deep Link (upi://pay)',
        mechanicUriPlaceholder: 'upi://pay?pa=apexmechanics@okicici&pn=ApexMechanics',
        checkoutInstructions: 'Scan the NPCI UPI QR in Google Pay, PhonePe, Paytm, or BHIM to pay directly.',
      },
      bank_transfer: {
        localLabel: 'IMPS / NEFT',
        localHint: 'IFSC & Account Transfer',
        customerFieldLabel: 'IMPS / Bank Reference',
        customerPlaceholder: 'e.g. HDFC IMPS Transfer',
        mechanicHandleLabel: 'Account & IFSC Code',
        mechanicHandlePlaceholder: 'Acct 502000... · IFSC HDFC0001',
        mechanicUriLabel: 'Bank Transfer URI',
        mechanicUriPlaceholder: 'upi://pay?pa=bank@ifsc',
        checkoutInstructions: 'Send IMPS/NEFT directly to the company bank account and IFSC shown.',
      },
    },
  },
  {
    code: 'BR',
    name: 'Brazil',
    currencyCode: 'BRL',
    currencySymbol: 'R$',
    approxUsdRate: 5.75,
    recommendedMethods: ['pix', 'card', 'cash', 'bank_transfer'],
    defaultMethod: 'pix',
    localNoteBanner: 'Brazil rails: Pix (Instant QR / Chave Pix), Cartão (Elo/Visa/Mastercard), TED, or BRL cash.',
    methodOverrides: {
      pix: {
        localLabel: 'Pix Instantâneo',
        localHint: 'QR Pix · CNPJ · Chave Aleatória',
        customerFieldLabel: 'Pix Bank / Note',
        customerPlaceholder: 'e.g. Nubank / Itaú Pix Instantâneo',
        mechanicHandleLabel: 'Chave Pix (CNPJ / Email / Cel)',
        mechanicHandlePlaceholder: 'CNPJ 12.345.678/0001-90',
        mechanicUriLabel: 'Pix Copia e Cola / QR Payload',
        mechanicUriPlaceholder: '00020126580014br.gov.bcb.pix...',
        checkoutInstructions: 'Scan the Pix QR or use Chave Pix directly in your Brazilian bank app.',
      },
    },
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    currencyCode: 'GBP',
    currencySymbol: '£',
    approxUsdRate: 0.79,
    recommendedMethods: ['card', 'bank_transfer', 'digital_wallet', 'cash'],
    defaultMethod: 'card',
    localNoteBanner: 'UK rails: Faster Payments (Sort Code + Acct), Visa/Mastercard/Apple Pay, Monzo/Revolut, or GBP cash.',
    methodOverrides: {
      bank_transfer: {
        localLabel: 'Faster Payments (UK)',
        localHint: 'Sort Code & Account No.',
        customerFieldLabel: 'UK Bank App (Monzo / Barclays / HSBC)',
        customerPlaceholder: 'e.g. Faster Payments GBP',
        mechanicHandleLabel: 'Sort Code & Account Number',
        mechanicHandlePlaceholder: 'Sort 04-00-04 · Acct 88421093',
        mechanicUriLabel: 'Open Banking / Monzo.me Link',
        mechanicUriPlaceholder: 'https://monzo.me/apexroadsideuk',
        checkoutInstructions: 'Pay immediately via UK Faster Payments or Open Banking link.',
      },
      digital_wallet: {
        localLabel: 'Revolut / Monzo / PayPal',
        localHint: 'Instant UK wallet transfer',
        customerFieldLabel: 'Wallet App',
        customerPlaceholder: 'e.g. Revolut Revtag / Apple Pay',
        mechanicHandleLabel: 'Revtag / PayPal.me Handle',
        mechanicHandlePlaceholder: '@apexmechanicsuk',
        mechanicUriLabel: 'Wallet QR / Link URI',
        mechanicUriPlaceholder: 'https://revolut.me/apexmechanicsuk',
        checkoutInstructions: 'Send GBP via Revolut, Monzo.me, or PayPal QR directly to the workshop.',
      },
    },
  },
  {
    code: 'EU',
    name: 'European Union (Eurozone)',
    currencyCode: 'EUR',
    currencySymbol: '€',
    approxUsdRate: 0.92,
    recommendedMethods: ['card', 'bank_transfer', 'digital_wallet', 'cash'],
    defaultMethod: 'bank_transfer',
    localNoteBanner: 'Eurozone rails: SEPA Instant (IBAN/BIC), iDEAL / Bancontact / Bizum, Card, or EUR cash.',
    methodOverrides: {
      bank_transfer: {
        localLabel: 'SEPA Instant (IBAN)',
        localHint: 'EPC QR · IBAN · BIC',
        customerFieldLabel: 'SEPA Bank / App',
        customerPlaceholder: 'e.g. SEPA Instant / iDEAL / Bizum',
        mechanicHandleLabel: 'Company IBAN & BIC',
        mechanicHandlePlaceholder: 'DE89 3704 0044 0532 0130 00',
        mechanicUriLabel: 'EPC SEPA QR / IBAN URI',
        mechanicUriPlaceholder: 'BCD\n002\n1\nSCT\nDE89370400440532013000',
        checkoutInstructions: 'Scan EPC QR or send SEPA Instant EUR transfer to the company IBAN.',
      },
      digital_wallet: {
        localLabel: 'PayPal / Revolut / Bizum',
        localHint: 'European instant wallets',
        customerFieldLabel: 'Wallet App',
        customerPlaceholder: 'e.g. Bizum / Lydia / PayPal EUR',
        mechanicHandleLabel: 'Wallet Handle / Bizum Phone',
        mechanicHandlePlaceholder: 'paypal.me/apexroadsideeu',
        mechanicUriLabel: 'Wallet Payment Link',
        mechanicUriPlaceholder: 'https://paypal.me/apexroadsideeu',
        checkoutInstructions: 'Pay in EUR using PayPal, Revolut, Bizum, iDEAL, or Bancontact.',
      },
    },
  },
  {
    code: 'MX',
    name: 'Mexico',
    currencyCode: 'MXN',
    currencySymbol: 'MX$',
    approxUsdRate: 19.8,
    recommendedMethods: ['bank_transfer', 'digital_wallet', 'card', 'cash'],
    defaultMethod: 'bank_transfer',
    localNoteBanner: 'Mexico rails: SPEI Instantáneo (CLABE 18 dígitos), CoDi QR / Mercado Pago, Card, or MXN cash.',
    methodOverrides: {
      bank_transfer: {
        localLabel: 'SPEI (CLABE)',
        localHint: 'Transferencia SPEI 24/7',
        customerFieldLabel: 'Banco / Nota SPEI',
        customerPlaceholder: 'e.g. BBVA / Nu México SPEI',
        mechanicHandleLabel: 'CLABE Interbancaria (18 dígitos)',
        mechanicHandlePlaceholder: 'CLABE 012180004455667788',
        mechanicUriLabel: 'CoDi QR / SPEI URI',
        mechanicUriPlaceholder: 'codi://pay?clabe=012180004455667788',
        checkoutInstructions: 'Realiza transferencia SPEI a la CLABE o escanea el QR CoDi.',
      },
      digital_wallet: {
        localLabel: 'Mercado Pago / CoDi',
        localHint: 'Billetera digital México',
        customerFieldLabel: 'App de Pago',
        customerPlaceholder: 'e.g. Mercado Pago MXN',
        mechanicHandleLabel: 'Alias Mercado Pago',
        mechanicHandlePlaceholder: 'talleres.apex.mx',
        mechanicUriLabel: 'Link / QR Mercado Pago',
        mechanicUriPlaceholder: 'https://mpago.la/apexmx',
        checkoutInstructions: 'Paga con Mercado Pago QR directamente al taller.',
      },
    },
  },
  {
    code: 'CA',
    name: 'Canada',
    currencyCode: 'CAD',
    currencySymbol: 'CA$',
    approxUsdRate: 1.39,
    recommendedMethods: ['bank_transfer', 'card', 'cash', 'digital_wallet'],
    defaultMethod: 'bank_transfer',
    localNoteBanner: 'Canada rails: Interac e-Transfer, Visa/Mastercard/Interac Debit, Apple Pay, or CAD cash.',
    methodOverrides: {
      bank_transfer: {
        localLabel: 'Interac e-Transfer',
        localHint: 'Autodeposit email / phone',
        customerFieldLabel: 'Interac Email / Note',
        customerPlaceholder: 'e.g. Interac e-Transfer CAD',
        mechanicHandleLabel: 'Interac Autodeposit Email',
        mechanicHandlePlaceholder: 'billing@apexmechanics.ca',
        mechanicUriLabel: 'Interac Request URI',
        mechanicUriPlaceholder: 'https://pay.wrenchbid.app/interac-ca',
        checkoutInstructions: 'Send an Interac e-Transfer in CAD to the workshop autodeposit email.',
      },
    },
  },
  {
    code: 'AU',
    name: 'Australia',
    currencyCode: 'AUD',
    currencySymbol: 'A$',
    approxUsdRate: 1.53,
    recommendedMethods: ['bank_transfer', 'card', 'cash', 'digital_wallet'],
    defaultMethod: 'bank_transfer',
    localNoteBanner: 'Australia rails: PayID / Osko Instant Bank, EFTPOS / Card, Apple Pay, or AUD cash.',
    methodOverrides: {
      bank_transfer: {
        localLabel: 'PayID / Osko Instant',
        localHint: 'PayID ABN / Email / Phone',
        customerFieldLabel: 'PayID / Bank Note',
        customerPlaceholder: 'e.g. CommBank / Up PayID AUD',
        mechanicHandleLabel: 'Company PayID (ABN / Email)',
        mechanicHandlePlaceholder: 'pay@apexauto.com.au (PayID)',
        mechanicUriLabel: 'PayID / Osko URI',
        mechanicUriPlaceholder: 'payid://pay@apexauto.com.au',
        checkoutInstructions: 'Send instant Osko transfer via the workshop company PayID.',
      },
    },
  },
  {
    code: 'PH',
    name: 'Philippines',
    currencyCode: 'PHP',
    currencySymbol: '₱',
    approxUsdRate: 58.2,
    recommendedMethods: ['digital_wallet', 'bank_transfer', 'cash', 'card'],
    defaultMethod: 'digital_wallet',
    localNoteBanner: 'Philippines rails: GCash / Maya QRPh, InstaPay Bank Transfer, Card, or PHP cash.',
    methodOverrides: {
      digital_wallet: {
        localLabel: 'GCash / Maya (QRPh)',
        localHint: 'Philippine mobile QR',
        customerFieldLabel: 'GCash / Maya Note',
        customerPlaceholder: 'e.g. GCash QRPh PHP',
        mechanicHandleLabel: 'GCash / Maya Account',
        mechanicHandlePlaceholder: 'GCash +63 917 555 0192',
        mechanicUriLabel: 'QRPh Payment URI',
        mechanicUriPlaceholder: 'qrph://gcash/09175550192',
        checkoutInstructions: 'Scan the QRPh code using GCash, Maya, or any Philippine banking app.',
      },
    },
  },
  {
    code: 'SG',
    name: 'Singapore',
    currencyCode: 'SGD',
    currencySymbol: 'S$',
    approxUsdRate: 1.34,
    recommendedMethods: ['digital_wallet', 'bank_transfer', 'card', 'cash'],
    defaultMethod: 'digital_wallet',
    localNoteBanner: 'Singapore rails: PayNow (UEN/Mobile SGQR), GrabPay, FAST Transfer, Card, or SGD cash.',
    methodOverrides: {
      digital_wallet: {
        localLabel: 'PayNow / GrabPay (SGQR)',
        localHint: 'UEN / Mobile SGQR',
        customerFieldLabel: 'SGQR / GrabPay Note',
        customerPlaceholder: 'e.g. PayNow UEN / GrabPay',
        mechanicHandleLabel: 'Company PayNow UEN',
        mechanicHandlePlaceholder: 'UEN 202412345K · Apex Auto',
        mechanicUriLabel: 'SGQR / PayNow URI',
        mechanicUriPlaceholder: 'sgqr://paynow/202412345K',
        checkoutInstructions: 'Scan SGQR via PayNow, DBS PayLah!, OCBC, or GrabPay.',
      },
    },
  },
  {
    code: 'AE',
    name: 'United Arab Emirates',
    currencyCode: 'AED',
    currencySymbol: 'AED ',
    approxUsdRate: 3.67,
    recommendedMethods: ['card', 'bank_transfer', 'digital_wallet', 'cash'],
    defaultMethod: 'card',
    localNoteBanner: 'UAE rails: Aani Instant Pay, Emirates IBAN Transfer, Visa/Mastercard/Apple Pay, or AED cash.',
    methodOverrides: {
      bank_transfer: {
        localLabel: 'Aani / UAE IBAN',
        localHint: 'Instant UAE bank / Aani',
        customerFieldLabel: 'UAE Bank / Aani Note',
        customerPlaceholder: 'e.g. Emirates NBD / Aani AED',
        mechanicHandleLabel: 'UAE IBAN / Aani Mobile',
        mechanicHandlePlaceholder: 'AE07 0331 2345 6789 0123 456',
        mechanicUriLabel: 'Aani QR Payment URI',
        mechanicUriPlaceholder: 'aani://pay?iban=AE070331234567890123456',
        checkoutInstructions: 'Pay instantly via Aani QR or UAE bank IBAN transfer in AED.',
      },
    },
  },
  {
    code: 'JP',
    name: 'Japan',
    currencyCode: 'JPY',
    currencySymbol: '¥',
    approxUsdRate: 153,
    recommendedMethods: ['digital_wallet', 'card', 'cash', 'bank_transfer'],
    defaultMethod: 'digital_wallet',
    localNoteBanner: 'Japan rails: PayPay / Rakuten Pay / d払い QR, Credit Card / IC, Furikomi Bank, or JPY cash.',
    methodOverrides: {
      digital_wallet: {
        localLabel: 'PayPay / Rakuten Pay',
        localHint: 'JPQR Instant Wallet',
        customerFieldLabel: 'Wallet App (PayPay / LINE / Merpay)',
        customerPlaceholder: 'e.g. PayPay JPY',
        mechanicHandleLabel: 'PayPay ID / Merchant Store',
        mechanicHandlePlaceholder: 'PayPay: apex-roadside-jp',
        mechanicUriLabel: 'PayPay / JPQR URI',
        mechanicUriPlaceholder: 'https://qr.paypay.ne.jp/apexjp',
        checkoutInstructions: 'Scan PayPay or JPQR code to settle directly in JPY.',
      },
    },
  },
  {
    code: 'CN',
    name: 'China',
    currencyCode: 'CNY',
    currencySymbol: '¥',
    approxUsdRate: 7.24,
    recommendedMethods: ['digital_wallet', 'card', 'cash', 'bank_transfer'],
    defaultMethod: 'digital_wallet',
    localNoteBanner: 'China rails: Alipay (支付宝), WeChat Pay (微信支付), UnionPay (银联), or CNY cash.',
    methodOverrides: {
      digital_wallet: {
        localLabel: 'Alipay / WeChat Pay',
        localHint: '支付宝 · 微信支付 QR',
        customerFieldLabel: 'Wallet App (Alipay / WeChat Pay)',
        customerPlaceholder: 'e.g. Alipay / WeChat Pay CNY',
        mechanicHandleLabel: 'Alipay / WeChat Merchant ID',
        mechanicHandlePlaceholder: 'Alipay / WeChat @apexauto-cn',
        mechanicUriLabel: 'Alipay / WeChat QR URI',
        mechanicUriPlaceholder: 'https://qr.alipay.com/apexcn',
        checkoutInstructions: 'Scan with Alipay (支付宝) or WeChat Pay (微信支付) to pay directly.',
      },
      card: {
        localLabel: 'UnionPay / Card',
        localHint: '银联 UnionPay · Visa · MC',
        customerFieldLabel: 'Card Network Note',
        customerPlaceholder: 'e.g. UnionPay QuickPass',
        mechanicHandleLabel: 'UnionPay POS / Merchant Tag',
        mechanicHandlePlaceholder: 'UnionPay #8812039',
        mechanicUriLabel: 'UnionPay QR URI',
        mechanicUriPlaceholder: 'https://pay.wrenchbid.app/unionpay',
        checkoutInstructions: 'Pay with UnionPay QuickPass or card terminal on site.',
      },
    },
  },
  {
    code: 'GLOBAL',
    name: 'Other / International',
    currencyCode: 'USD',
    currencySymbol: '$',
    approxUsdRate: 1,
    recommendedMethods: ['cash', 'mobile_money', 'card', 'bank_transfer', 'digital_wallet', 'crypto'],
    defaultMethod: 'card',
    localNoteBanner: 'International rails: Card, Mobile Money, Bank Wire/IBAN, Digital Wallet, Crypto USDC/USDT, or Cash.',
    methodOverrides: {},
  },
];

export function getCountryPaymentProfile(countryCode?: string): CountryPaymentProfile {
  if (!countryCode) return COUNTRY_PAYMENT_PROFILES[0];
  return (
    COUNTRY_PAYMENT_PROFILES.find((c) => c.code === countryCode.toUpperCase()) ||
    COUNTRY_PAYMENT_PROFILES[COUNTRY_PAYMENT_PROFILES.length - 1]
  );
}

export function detectDefaultCountryCode(): string {
  if (typeof Intl === 'undefined' && typeof navigator === 'undefined') return 'US';

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const tzMap: Record<string, string> = {
      'Africa/Nairobi': 'KE',
      'Africa/Lagos': 'NG',
      'Africa/Accra': 'GH',
      'Africa/Johannesburg': 'ZA',
      'Africa/Harare': 'ZW',
      'Asia/Kolkata': 'IN',
      'Asia/Calcutta': 'IN',
      'America/Sao_Paulo': 'BR',
      'Europe/London': 'GB',
      'America/Mexico_City': 'MX',
      'America/Toronto': 'CA',
      'America/Vancouver': 'CA',
      'Australia/Sydney': 'AU',
      'Australia/Melbourne': 'AU',
      'Asia/Manila': 'PH',
      'Asia/Singapore': 'SG',
      'Asia/Dubai': 'AE',
      'Asia/Tokyo': 'JP',
      'Asia/Shanghai': 'CN',
    };
    if (tzMap[tz]) return tzMap[tz];
    if (tz.startsWith('Europe/')) return 'EU';

    const locale = (typeof navigator !== 'undefined' && navigator.language) || '';
    const region = locale.split('-')[1]?.toUpperCase();
    if (region && COUNTRY_PAYMENT_PROFILES.some((c) => c.code === region)) {
      return region;
    }
  } catch {
    // Fallback to US if Intl fails
  }
  return 'US';
}

export function formatLocalCurrencyApprox(amountUsd: number, profile: CountryPaymentProfile): string {
  if (profile.currencyCode === 'USD') {
    return `$${amountUsd.toFixed(2)} USD`;
  }
  const converted = amountUsd * profile.approxUsdRate;
  const formatted =
    converted >= 100
      ? Math.round(converted).toLocaleString()
      : converted.toFixed(2);
  return `≈ ${profile.currencySymbol}${formatted} ${profile.currencyCode} ($${amountUsd.toFixed(0)} USD)`;
}

export function getCountryMethodDetail(
  countryCode: string | undefined,
  method: CustomerPaymentMethod
): CountryPaymentMethodDetail {
  const profile = getCountryPaymentProfile(countryCode);
  const override = profile.methodOverrides[method];
  if (override) return override;

  const fallbackByMethod: Record<CustomerPaymentMethod, CountryPaymentMethodDetail> = {
    cash: {
      localLabel: `Cash (${profile.currencyCode})`,
      localHint: `Direct ${profile.currencyCode} cash on site`,
      customerFieldLabel: 'Cash Currency Note',
      customerPlaceholder: `e.g. Paying exact ${profile.currencyCode} cash on site`,
      mechanicHandleLabel: 'Cash Receipt / Workshop Name',
      mechanicHandlePlaceholder: 'Cash accepted on arrival',
      mechanicUriLabel: 'Fallback QR / Backup URI',
      mechanicUriPlaceholder: 'https://pay.wrenchbid.app/cash-receipt',
      checkoutInstructions: `Hand ${profile.currencyCode} or USD equivalent cash directly to the mechanic on site (0% platform fee).`,
    },
    mobile_money: {
      localLabel: 'Mobile Money',
      localHint: 'M-Pesa · MTN MoMo · Airtel · Wave',
      customerFieldLabel: 'Mobile Money Network / Note',
      customerPlaceholder: `e.g. Mobile Money (${profile.currencyCode})`,
      mechanicHandleLabel: 'Mobile Money Merchant / Phone',
      mechanicHandlePlaceholder: '+1 / +254 / +233 Mobile Wallet',
      mechanicUriLabel: 'Mobile Money QR / URI',
      mechanicUriPlaceholder: 'https://pay.wrenchbid.app/momo',
      checkoutInstructions: 'Send via local Mobile Money wallet or scan the company QR code.',
    },
    card: {
      localLabel: 'Card',
      localHint: 'Visa · Mastercard · Amex · UnionPay',
      customerFieldLabel: 'Card / Tap-to-Pay Note',
      customerPlaceholder: 'e.g. Visa / Mastercard contactless',
      mechanicHandleLabel: 'Card Terminal / Checkout Tag',
      mechanicHandlePlaceholder: '@workshop-card',
      mechanicUriLabel: 'Card Checkout QR / URI',
      mechanicUriPlaceholder: 'https://pay.wrenchbid.app/card',
      checkoutInstructions: 'Pay by Visa, Mastercard, Amex, UnionPay, or contactless card QR.',
    },
    bank_transfer: {
      localLabel: 'Bank Transfer',
      localHint: 'Instant local bank / IBAN / Wire',
      customerFieldLabel: 'Bank Transfer Details / App',
      customerPlaceholder: `e.g. Instant bank transfer (${profile.currencyCode})`,
      mechanicHandleLabel: 'Company Bank Account / IBAN',
      mechanicHandlePlaceholder: 'Bank Name · Account / IBAN',
      mechanicUriLabel: 'Bank QR / Reference Link',
      mechanicUriPlaceholder: 'https://pay.wrenchbid.app/bank',
      checkoutInstructions: 'Complete an instant bank transfer directly to the workshop company account.',
    },
    upi: {
      localLabel: 'UPI',
      localHint: 'GPay · PhonePe · Paytm · BHIM',
      customerFieldLabel: 'UPI App Note',
      customerPlaceholder: 'e.g. Google Pay / PhonePe UPI',
      mechanicHandleLabel: 'UPI VPA ID',
      mechanicHandlePlaceholder: 'workshop@okaxis',
      mechanicUriLabel: 'UPI QR URI (upi://pay)',
      mechanicUriPlaceholder: 'upi://pay?pa=workshop@okaxis',
      checkoutInstructions: 'Scan the UPI QR code in Google Pay, PhonePe, Paytm, or BHIM.',
    },
    pix: {
      localLabel: 'Pix',
      localHint: 'Instant Pix QR / Chave Pix',
      customerFieldLabel: 'Pix Key / Bank Note',
      customerPlaceholder: 'e.g. Pix Instantâneo',
      mechanicHandleLabel: 'Chave Pix (CPF / CNPJ / Email)',
      mechanicHandlePlaceholder: 'pix@oficina.com.br',
      mechanicUriLabel: 'Pix Copia e Cola URI',
      mechanicUriPlaceholder: '00020126580014br.gov.bcb.pix...',
      checkoutInstructions: 'Scan the Pix QR code directly in your Brazilian banking app.',
    },
    digital_wallet: {
      localLabel: 'Digital Wallet',
      localHint: 'PayPal · Alipay · WeChat · GrabPay · GCash',
      customerFieldLabel: 'Digital Wallet App',
      customerPlaceholder: 'e.g. PayPal / Alipay / GrabPay',
      mechanicHandleLabel: 'Wallet Handle / Merchant ID',
      mechanicHandlePlaceholder: '@workshop-wallet',
      mechanicUriLabel: 'Wallet QR / Link URI',
      mechanicUriPlaceholder: 'https://paypal.me/workshop',
      checkoutInstructions: 'Scan the QR code in your digital wallet app to settle directly.',
    },
    crypto: {
      localLabel: 'Crypto / Stablecoin',
      localHint: 'USDC · USDT · Bitcoin Lightning',
      customerFieldLabel: 'Network / Asset (USDC Base / USDT TRC20 / BTC)',
      customerPlaceholder: 'e.g. USDC on Base / Lightning',
      mechanicHandleLabel: 'Wallet Address / Lightning Handle',
      mechanicHandlePlaceholder: '0x71C... or ln@workshop.app',
      mechanicUriLabel: 'Crypto Payment URI',
      mechanicUriPlaceholder: 'ethereum:0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      checkoutInstructions: 'Transfer USDC, USDT, or Bitcoin Lightning directly to the company wallet QR.',
    },
  };

  return fallbackByMethod[method];
}

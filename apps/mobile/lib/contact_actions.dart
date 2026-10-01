import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

String? contactNumber(String raw) {
  if (raw.length > 40) return null;
  var phone = raw
      .trim()
      .replaceAllMapped(
        RegExp('[০-৯]'),
        (m) => (m[0]!.runes.first - 0x09e6).toString(),
      )
      .replaceAll(RegExp(r'[ ()-]'), '');
  if (RegExp(r'^01[3-9]\d{8}$').hasMatch(phone)) {
    phone = '+88$phone';
  } else if (RegExp(r'^8801[3-9]\d{8}$').hasMatch(phone)) {
    phone = '+$phone';
  }
  if (phone.startsWith('+880') &&
      !RegExp(r'^\+8801[3-9]\d{8}$').hasMatch(phone)) {
    return null;
  }
  return RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(phone) ? phone : null;
}

typedef ContactLauncher = Future<bool> Function(Uri uri);

class ContactActions extends StatelessWidget {
  const ContactActions({required this.raw, this.launcher, super.key});
  final String raw;
  final ContactLauncher? launcher;
  Future<void> _open(BuildContext context, Uri uri) async {
    try {
      final opened =
          await (launcher?.call(uri) ??
              launchUrl(uri, mode: LaunchMode.externalApplication));
      if (opened) return;
    } catch (_) {
      /* Offer a copy fallback when no app can handle the link. */
    }
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Could not open that app. You can copy the contact instead.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final number = contactNumber(raw);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (number != null)
          Text('Use $number', style: Theme.of(context).textTheme.bodySmall),
        Wrap(
          spacing: 8,
          children: [
            if (number != null) ...[
              OutlinedButton.icon(
                onPressed: () =>
                    _open(context, Uri(scheme: 'tel', path: number)),
                icon: const Icon(Icons.call_outlined),
                label: const Text('Call'),
              ),
              OutlinedButton.icon(
                onPressed: () => _open(
                  context,
                  Uri.https('wa.me', '/${number.substring(1)}'),
                ),
                icon: const Icon(Icons.chat_outlined),
                label: const Text('WhatsApp'),
              ),
            ],
            TextButton.icon(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: raw));
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Contact copied')),
                  );
                }
              },
              icon: const Icon(Icons.copy),
              label: const Text('Copy'),
            ),
          ],
        ),
        if (number == null)
          const Text(
            'This contact is not a single recognizable number. Copy it to check manually.',
          ),
      ],
    );
  }
}

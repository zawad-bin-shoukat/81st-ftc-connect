import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api_client.dart';

Future<void> openPrivacyPolicy(BuildContext context) async {
  final uri = Uri.parse('${ApiClient.baseUrl}/privacy');
  try {
    if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return;
  } catch (_) {}
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Could not open the privacy policy. Please retry.'),
      ),
    );
  }
}

import 'package:flutter/material.dart';

import 'phone_sign_in_screen.dart';
import 'preview_shell.dart';
import 'test_sign_in_screen.dart';
import '../privacy_link.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, viewport) => SingleChildScrollView(
            child: Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: 480,
                  minHeight: viewport.maxHeight,
                ),
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Align(
                        child: CircleAvatar(
                          radius: 48,
                          backgroundColor: colors.primaryContainer,
                          child: Icon(
                            Icons.groups_rounded,
                            size: 52,
                            color: colors.primary,
                          ),
                        ),
                      ),
                      const SizedBox(height: 30),
                      Text(
                        '81st FTC Connect',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineMedium
                            ?.copyWith(fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'A private space to find and stay connected with fellow FTC members.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                      const SizedBox(height: 48),
                      FilledButton.icon(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => const PhoneSignInScreen(),
                          ),
                        ),
                        icon: const Icon(Icons.phone_iphone),
                        label: const Text('Sign in with phone'),
                      ),
                      const SizedBox(height: 12),
                      OutlinedButton(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => const PreviewShell(),
                          ),
                        ),
                        child: const Text('Explore interface preview'),
                      ),
                      TextButton(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => const TestSignInScreen(),
                          ),
                        ),
                        child: const Text('Administrator / test sign-in'),
                      ),
                      TextButton(
                        onPressed: () => openPrivacyPolicy(context),
                        child: const Text('Privacy policy'),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Sign in to view the real roster. Interface preview uses fictional profiles.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

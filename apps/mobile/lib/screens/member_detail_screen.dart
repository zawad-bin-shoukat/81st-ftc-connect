import 'package:flutter/material.dart';

import '../preview_member.dart';

class MemberDetailScreen extends StatelessWidget {
  const MemberDetailScreen({required this.member, super.key});

  final PreviewMember member;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Member profile')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 700),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Icon(Icons.account_circle_outlined, size: 88),
              const SizedBox(height: 12),
              Text(
                member.name,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              Text(
                '${member.ftcId} · Section ${member.section}',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              _InfoCard(
                title: 'FTC',
                children: [
                  _InfoRow(label: 'Cadre', value: member.cadre),
                  _InfoRow(label: 'BCS batch', value: member.bcsBatch),
                ],
              ),
              _InfoCard(
                title: 'Education',
                children: [
                  _InfoRow(label: 'Education', value: member.education),
                  _InfoRow(label: 'University', value: member.university),
                ],
              ),
              _InfoCard(
                title: 'Contact',
                children: [
                  _InfoRow(label: 'WhatsApp contact', value: member.phone),
                  _InfoRow(label: 'Email', value: member.email),
                  _InfoRow(label: 'Home district', value: member.homeDistrict),
                  _InfoRow(label: 'Blood group', value: member.bloodGroup),
                ],
              ),
              if (member.aboutMe.isNotEmpty ||
                  member.favouriteQuotation.isNotEmpty)
                _InfoCard(
                  title: 'More',
                  children: [
                    if (member.aboutMe.isNotEmpty)
                      _InfoRow(label: 'About me', value: member.aboutMe),
                    if (member.favouriteQuotation.isNotEmpty)
                      _InfoRow(
                        label: 'Favourite quotation',
                        value: member.favouriteQuotation,
                      ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const Divider(),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(label, style: Theme.of(context).textTheme.bodySmall),
          ),
          Expanded(child: SelectableText(value)),
        ],
      ),
    );
  }
}

# User Management

## Roles

- `analyst` - can investigate incidents, write notes, and run low-risk skills
- `incident-commander` - can approve containment actions and close incidents
- `admin` - manages integrations, user access, and runtime policy

## Access controls

- SEV1 destructive actions require incident commander or admin approval
- archived incidents stay readable to analysts but editable only by admins
- background agents inherit the least-privilege profile of the template that launched them

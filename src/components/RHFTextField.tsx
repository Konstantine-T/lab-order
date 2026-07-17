import { TextField, type TextFieldProps } from '@mui/material';
import { Controller, useFormContext } from 'react-hook-form';

type Props = Omit<TextFieldProps, 'name'> & {
  name: string;
};

export function RHFTextField({ name, helperText: staticHelperText, ...rest }: Props) {
  const { control } = useFormContext();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          value={field.value ?? ''}
          fullWidth
          {...rest}
          // Set error/helperText AFTER {...rest} so a validation message is never
          // masked by a static helperText passed in by the caller.
          error={!!fieldState.error}
          helperText={fieldState.error?.message ?? staticHelperText}
        />
      )}
    />
  );
}
